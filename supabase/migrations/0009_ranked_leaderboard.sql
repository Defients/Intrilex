-- ═══════════════════════════════════════════════════════════════
-- Migration 0009: Ranked Leaderboard & Competitive Standing ecosystem
--
-- Adds:
--   ranked_seasons           — first-class season lifecycle
--   player_ratings columns   — Glicko-2 state (RD, volatility), peak,
--                              placements, last-rated, activity
--   rating_events            — server-owned rating event ledger (audit)
--   ranked_season_archive    — read-only final standings snapshots
--   Indexes                  — leaderboard query performance
--   RLS                      — public SELECT on safe projection only;
--                              NO client writes (service role only)
--   RPC get_ranked_leaderboard — server-side deterministic ranking
--   RPC get_player_standing    — My Rank (position outside Top 100)
--   RPC get_ranked_seasons     — season list for picker
--   RPC get_player_season_history — profile season history + peaks
--
-- Architectural law (section 3): the browser is never authoritative.
-- Rating/results/positions are written ONLY by the service role.
-- Leaderboard position is DERIVED (ROW_NUMBER), never stored as
-- ordinary mutable per-player state (section 33).
-- ═══════════════════════════════════════════════════════════════

-- ── ranked_seasons ──
CREATE TABLE IF NOT EXISTS public.ranked_seasons (
  id           serial PRIMARY KEY,
  season_id    text NOT NULL UNIQUE,
  queue_id     text NOT NULL DEFAULT 'ranked',
  name         text NOT NULL,
  ordinal      integer NOT NULL DEFAULT 1,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'UPCOMING'
    CHECK (status IN ('UPCOMING','ACTIVE','FINALIZING','ARCHIVED')),
  rules_version    text,
  tier_config_version text,
  rating_algorithm_version text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ranked_seasons ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see season metadata (no private data here)
CREATE POLICY ranked_seasons_select ON public.ranked_seasons
  FOR SELECT TO authenticated USING (true);

-- Single-active-season invariant guard (only one ACTIVE per queue)
CREATE UNIQUE INDEX IF NOT EXISTS ranked_seasons_one_active
  ON public.ranked_seasons (queue_id)
  WHERE status = 'ACTIVE';

-- ── Extend player_ratings with Glicko-2 state + peak + placements ──
ALTER TABLE public.player_ratings
  ADD COLUMN IF NOT EXISTS rating_deviation double precision NOT NULL DEFAULT 350
    CHECK (rating_deviation > 0 AND rating_deviation <= 350),
  ADD COLUMN IF NOT EXISTS volatility double precision NOT NULL DEFAULT 0.06
    CHECK (volatility > 0 AND volatility < 1),
  ADD COLUMN IF NOT EXISTS peak_rating integer NOT NULL DEFAULT 1200
    CHECK (peak_rating >= 0 AND peak_rating <= 5000),
  ADD COLUMN IF NOT EXISTS placements_played integer NOT NULL DEFAULT 0
    CHECK (placements_played >= 0),
  ADD COLUMN IF NOT EXISTS last_rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_rated_match_id text;

-- Index for canonical leaderboard ordering (section 34):
--   rating DESC, rating_deviation ASC, rated_matches DESC, last_rated_at DESC
CREATE INDEX IF NOT EXISTS player_ratings_leaderboard_idx
  ON public.player_ratings (queue_id, season_id, rating DESC, rating_deviation ASC, rated_matches DESC, last_rated_at DESC)
  WHERE provisional = false;

-- Eligibility index (placements complete + not provisional)
CREATE INDEX IF NOT EXISTS player_ratings_eligible_idx
  ON public.player_ratings (queue_id, season_id, rating DESC)
  WHERE provisional = false AND placements_played >= 5;

-- ── rating_events — server-owned audit ledger (section 68) ──
CREATE TABLE IF NOT EXISTS public.rating_events (
  event_id          bigserial PRIMARY KEY,
  match_id          text NOT NULL,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id         text NOT NULL,
  queue_id          text NOT NULL DEFAULT 'ranked',
  rating_before     integer NOT NULL,
  rating_after      integer NOT NULL,
  rating_delta      integer NOT NULL,
  rd_before         double precision NOT NULL,
  rd_after          double precision NOT NULL,
  volatility_before double precision NOT NULL,
  volatility_after  double precision NOT NULL,
  result            text NOT NULL CHECK (result IN ('WIN','LOSS','DRAW')),
  algorithm_version text NOT NULL DEFAULT 'glicko2-v1',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)   -- idempotency: one rating event per match per player
);

ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;

-- Owner can read their own rating history (for profile graphs); never others
CREATE POLICY rating_events_owner_select ON public.rating_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- NO INSERT/UPDATE/DELETE for authenticated — service role only.
-- The UNIQUE(match_id, user_id) constraint is the idempotency guarantee:
-- a reconnect/retry cannot insert a second rating event for the same match.

CREATE INDEX IF NOT EXISTS rating_events_user_idx
  ON public.rating_events (user_id, season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rating_events_match_idx
  ON public.rating_events (match_id);

-- ── ranked_season_archive — read-only final standings (section 49) ──
CREATE TABLE IF NOT EXISTS public.ranked_season_archive (
  id               bigserial PRIMARY KEY,
  season_id        text NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_player_id text NOT NULL,
  final_rating     integer NOT NULL,
  final_position   integer NOT NULL,
  final_tier       text NOT NULL,
  final_division   text,
  peak_rating      integer NOT NULL,
  peak_tier        text NOT NULL,
  peak_division    text,
  wins             integer NOT NULL DEFAULT 0,
  losses           integer NOT NULL DEFAULT 0,
  draws            integer NOT NULL DEFAULT 0,
  games            integer NOT NULL DEFAULT 0,
  archived_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

ALTER TABLE public.ranked_season_archive ENABLE ROW LEVEL SECURITY;

-- Public read of archived standings (safe projection — no auth uuid exposed
-- by the RPC; the raw table is owner-only for SELECT to avoid uuid leakage)
CREATE POLICY ranked_season_archive_owner_select ON public.ranked_season_archive
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ranked_season_archive_season_idx
  ON public.ranked_season_archive (season_id, final_position);

-- ── Service role grants for new tables/columns ──
GRANT ALL PRIVILEGES ON TABLE public.ranked_seasons TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rating_events TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.ranked_season_archive TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ranked_seasons_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rating_events_event_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ranked_season_archive_id_seq TO service_role;

-- ── updated_at trigger for ranked_seasons ──
DROP TRIGGER IF EXISTS ranked_seasons_updated_at ON public.ranked_seasons;
CREATE TRIGGER ranked_seasons_updated_at
  BEFORE UPDATE ON public.ranked_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_ranked_leaderboard
--
-- Server-side deterministic ranking. The browser never sorts the full
-- table. Returns ONLY safe public columns (section 15/37):
--   position, public_player_id, display_name, handle, avatar_url,
--   rating, wins, losses, draws, rated_matches, tier, division, is_apex
--
-- Eligibility (section 14): placements complete (>=5), not provisional,
-- not banned. Position is ROW_NUMBER over the canonical tie-break order.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_ranked_leaderboard(
  p_season_id   text DEFAULT NULL,
  p_queue_id    text DEFAULT 'ranked',
  p_tier_filter text DEFAULT NULL,
  p_search      text DEFAULT NULL,
  p_limit       integer DEFAULT 100,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  "position"      integer,
  public_player_id text,
  display_name    text,
  handle          text,
  avatar_url      text,
  rating          integer,
  wins            integer,
  losses          integer,
  draws           integer,
  rated_matches   integer,
  tier            text,
  division        text,
  is_apex         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id text;
  v_search    text;
BEGIN
  -- Resolve active season if not specified
  IF p_season_id IS NULL THEN
    SELECT season_id INTO v_season_id
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
    IF v_season_id IS NULL THEN
      v_season_id := 'season-1';
    END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  -- Sanitize search: trim + cap length, build ILIKE pattern
  v_search := NULL;
  IF p_search IS NOT NULL THEN
    v_search := trim(p_search);
    IF length(v_search) < 2 OR length(v_search) > 64 THEN
      v_search := NULL;
    ELSE
      v_search := '%' || v_search || '%';
    END IF;
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      pr.user_id,
      p.public_player_id,
      p.display_name,
      p.handle,
      p.avatar_url,
      pr.rating,
      pr.wins,
      pr.losses,
      pr.draws,
      pr.rated_matches,
      pr.rating_deviation,
      pr.last_rated_at,
      ROW_NUMBER() OVER (
        ORDER BY
          pr.rating DESC,
          pr.rating_deviation ASC,
          pr.rated_matches DESC,
          pr.last_rated_at DESC NULLS LAST,
          p.public_player_id ASC
      ) AS pos
    FROM public.player_ratings pr
    JOIN public.profiles p ON p.user_id = pr.user_id
    LEFT JOIN public.account_moderation m ON m.user_id = pr.user_id
    WHERE pr.queue_id = p_queue_id
      AND pr.season_id = v_season_id
      AND pr.provisional = false
      AND pr.placements_played >= 5
      AND (m.status IS NULL OR m.status = 'ACTIVE')
      AND (v_search IS NULL
           OR lower(p.handle) LIKE lower(v_search)
           OR lower(p.display_name) LIKE lower(v_search))
  )
  SELECT
    e.pos::integer AS "position",
    e.public_player_id,
    e.display_name,
    e.handle,
    e.avatar_url,
    e.rating,
    e.wins,
    e.losses,
    e.draws,
    e.rated_matches,
    CASE
      WHEN e.rating >= 2400 THEN 'INTRILEX'
      WHEN e.rating >= 2200 THEN 'SOVEREIGN'
      WHEN e.rating >= 2000 THEN 'PARAGON'
      WHEN e.rating >= 1800 THEN 'ASCENDANT'
      WHEN e.rating >= 1600 THEN 'VANGUARD'
      WHEN e.rating >= 1400 THEN 'WARDEN'
      WHEN e.rating >= 1200 THEN 'CIPHER'
      ELSE 'INITIATE'
    END AS tier,
    CASE
      WHEN e.rating >= 2400 THEN NULL
      WHEN mod(e.rating - (CASE
        WHEN e.rating >= 2200 THEN 2200
        WHEN e.rating >= 2000 THEN 2000
        WHEN e.rating >= 1800 THEN 1800
        WHEN e.rating >= 1600 THEN 1600
        WHEN e.rating >= 1400 THEN 1400
        WHEN e.rating >= 1200 THEN 1200
        ELSE 0
      END), 200) < 67 THEN 'III'
      WHEN mod(e.rating - (CASE
        WHEN e.rating >= 2200 THEN 2200
        WHEN e.rating >= 2000 THEN 2000
        WHEN e.rating >= 1800 THEN 1800
        WHEN e.rating >= 1600 THEN 1600
        WHEN e.rating >= 1400 THEN 1400
        WHEN e.rating >= 1200 THEN 1200
        ELSE 0
      END), 200) < 134 THEN 'II'
      ELSE 'I'
    END AS division,
    (e.rating >= 2400) AS is_apex
  FROM eligible e
  WHERE p_tier_filter IS NULL OR p_tier_filter = 'ALL'
     OR (p_tier_filter = 'INTRILEX' AND e.rating >= 2400)
     OR (p_tier_filter = 'SOVEREIGN' AND e.rating >= 2200 AND e.rating < 2400)
     OR (p_tier_filter = 'PARAGON' AND e.rating >= 2000 AND e.rating < 2200)
     OR (p_tier_filter = 'ASCENDANT' AND e.rating >= 1800 AND e.rating < 2000)
     OR (p_tier_filter = 'VANGUARD' AND e.rating >= 1600 AND e.rating < 1800)
     OR (p_tier_filter = 'WARDEN' AND e.rating >= 1400 AND e.rating < 1600)
     OR (p_tier_filter = 'CIPHER' AND e.rating >= 1200 AND e.rating < 1400)
     OR (p_tier_filter = 'INITIATE' AND e.rating < 1200)
  ORDER BY e.pos
  LIMIT LEAST(GREATEST(p_limit, 1), 200)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_player_standing — My Rank (works outside Top 100)
-- Returns the signed-in player's position + entry, or NULL if ineligible.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_standing(
  p_season_id text DEFAULT NULL,
  p_queue_id  text DEFAULT 'ranked',
  p_user_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  "position"      integer,
  public_player_id text,
  display_name    text,
  handle          text,
  avatar_url      text,
  rating          integer,
  wins            integer,
  losses          integer,
  draws           integer,
  rated_matches   integer,
  tier            text,
  division        text,
  is_apex         boolean,
  peak_rating     integer,
  placements_played integer,
  is_placement    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id text;
  v_user_id   uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN RETURN; END IF;

  IF p_season_id IS NULL THEN
    SELECT season_id INTO v_season_id
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
    IF v_season_id IS NULL THEN v_season_id := 'season-1'; END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      pr.user_id,
      p.public_player_id,
      p.display_name,
      p.handle,
      p.avatar_url,
      pr.rating,
      pr.wins,
      pr.losses,
      pr.draws,
      pr.rated_matches,
      pr.peak_rating,
      pr.placements_played,
      pr.provisional,
      ROW_NUMBER() OVER (
        ORDER BY pr.rating DESC, pr.rating_deviation ASC,
                 pr.rated_matches DESC, pr.last_rated_at DESC NULLS LAST,
                 p.public_player_id ASC
      ) AS pos
    FROM public.player_ratings pr
    JOIN public.profiles p ON p.user_id = pr.user_id
    LEFT JOIN public.account_moderation m ON m.user_id = pr.user_id
    WHERE pr.queue_id = p_queue_id
      AND pr.season_id = v_season_id
      AND pr.provisional = false
      AND pr.placements_played >= 5
      AND (m.status IS NULL OR m.status = 'ACTIVE')
  )
  SELECT
    e.pos::integer, e.public_player_id, e.display_name, e.handle, e.avatar_url,
    e.rating, e.wins, e.losses, e.draws, e.rated_matches,
    CASE WHEN e.rating >= 2400 THEN 'INTRILEX'
         WHEN e.rating >= 2200 THEN 'SOVEREIGN'
         WHEN e.rating >= 2000 THEN 'PARAGON'
         WHEN e.rating >= 1800 THEN 'ASCENDANT'
         WHEN e.rating >= 1600 THEN 'VANGUARD'
         WHEN e.rating >= 1400 THEN 'WARDEN'
         WHEN e.rating >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END,
    CASE WHEN e.rating >= 2400 THEN NULL
         WHEN mod(e.rating - (CASE
           WHEN e.rating >= 2200 THEN 2200 WHEN e.rating >= 2000 THEN 2000
           WHEN e.rating >= 1800 THEN 1800 WHEN e.rating >= 1600 THEN 1600
           WHEN e.rating >= 1400 THEN 1400 WHEN e.rating >= 1200 THEN 1200 ELSE 0 END), 200) < 67 THEN 'III'
         WHEN mod(e.rating - (CASE
           WHEN e.rating >= 2200 THEN 2200 WHEN e.rating >= 2000 THEN 2000
           WHEN e.rating >= 1800 THEN 1800 WHEN e.rating >= 1600 THEN 1600
           WHEN e.rating >= 1400 THEN 1400 WHEN e.rating >= 1200 THEN 1200 ELSE 0 END), 200) < 134 THEN 'II'
         ELSE 'I' END,
    (e.rating >= 2400), e.peak_rating, e.placements_played, false
  FROM eligible e
  WHERE e.user_id = v_user_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_ranked_seasons — season picker (active + archives)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_ranked_seasons(
  p_queue_id text DEFAULT 'ranked'
)
RETURNS TABLE (
  season_id text, name text, ordinal integer,
  starts_at timestamptz, ends_at timestamptz, status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT season_id, name, ordinal, starts_at, ends_at, status
  FROM public.ranked_seasons
  WHERE queue_id = p_queue_id
  ORDER BY (status = 'ACTIVE') DESC,
           (status = 'UPCOMING') DESC,
           CASE WHEN status = 'ARCHIVED' THEN ends_at ELSE starts_at END DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_player_season_history — profile season history + peaks
-- Returns the caller's archived seasons plus current-season summary.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_season_history(
  p_queue_id text DEFAULT 'ranked',
  p_user_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  season_id text, name text, status text,
  final_rating integer, final_position integer,
  final_tier text, final_division text,
  peak_rating integer, peak_tier text, peak_division text,
  wins integer, losses integer, draws integer, games integer,
  is_current boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Archived seasons
  RETURN QUERY
  SELECT a.season_id, s.name, 'ARCHIVED',
    a.final_rating, a.final_position, a.final_tier, a.final_division,
    a.peak_rating, a.peak_tier, a.peak_division,
    a.wins, a.losses, a.draws, a.games, false
  FROM public.ranked_season_archive a
  JOIN public.ranked_seasons s ON s.season_id = a.season_id
  WHERE a.user_id = v_user_id;

  -- Current active season summary
  RETURN QUERY
  SELECT pr.season_id, s.name, 'ACTIVE',
    pr.rating, NULL::integer,
    CASE WHEN pr.rating >= 2400 THEN 'INTRILEX'
         WHEN pr.rating >= 2200 THEN 'SOVEREIGN'
         WHEN pr.rating >= 2000 THEN 'PARAGON'
         WHEN pr.rating >= 1800 THEN 'ASCENDANT'
         WHEN pr.rating >= 1600 THEN 'VANGUARD'
         WHEN pr.rating >= 1400 THEN 'WARDEN'
         WHEN pr.rating >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END,
    CASE WHEN pr.rating >= 2400 THEN NULL ELSE 'I' END,
    pr.peak_rating,
    CASE WHEN pr.peak_rating >= 2400 THEN 'INTRILEX'
         WHEN pr.peak_rating >= 2200 THEN 'SOVEREIGN'
         WHEN pr.peak_rating >= 2000 THEN 'PARAGON'
         WHEN pr.peak_rating >= 1800 THEN 'ASCENDANT'
         WHEN pr.peak_rating >= 1600 THEN 'VANGUARD'
         WHEN pr.peak_rating >= 1400 THEN 'WARDEN'
         WHEN pr.peak_rating >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END,
    NULL,
    pr.wins, pr.losses, pr.draws, (pr.wins + pr.losses + pr.draws), true
  FROM public.player_ratings pr
  JOIN public.ranked_seasons s ON s.season_id = pr.season_id
  WHERE pr.user_id = v_user_id AND pr.queue_id = p_queue_id
    AND s.status = 'ACTIVE';
END;
$$;

-- Grant execute on the leaderboard RPCs to authenticated users (read-only)
GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_standing TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranked_seasons TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_season_history TO authenticated;

-- ── Seed first season (idempotent) ──
INSERT INTO public.ranked_seasons (season_id, queue_id, name, ordinal, starts_at, ends_at, status, rules_version, tier_config_version, rating_algorithm_version)
VALUES ('season-1', 'ranked', 'Season 1', 1,
        '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z', 'ACTIVE',
        '4.2.6', 'tier-config-v1', 'glicko2-v1')
ON CONFLICT (season_id) DO NOTHING;
