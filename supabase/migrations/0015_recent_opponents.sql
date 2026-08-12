-- ═══════════════════════════════════════════════════════════════
-- Migration 0015: Recent Opponents
--
-- Adds the "Recent Opponents" discovery surface — the natural bridge
-- between Match History and the Player Directory. When a player
-- competes online, they build a history of opponents. This RPC lets
-- them find those opponents again, see their head-to-head record,
-- and navigate to the opponent's public profile.
--
-- Adds:
--   get_recent_opponents(p_limit, p_offset)
--     — server-side query returning opponents the authenticated user
--       has faced in completed matches, with safe public projection +
--       head-to-head W/L/D + last-played timestamp + match count.
--
-- Architectural law (section 3): the browser is never authoritative.
-- The opponent list is computed SERVER-SIDE from match_participants.
-- The browser cannot enumerate opponents or construct the head-to-head
-- record client-side (it would need to read every match row).
--
-- Privacy (section 13/34): the RPC returns ONLY the safe public
-- projection already established by get_player_directory:
--   public_player_id, display_name, handle, avatar_url,
--   rating, tier, division, is_apex, is_placement,
--   wins, losses, draws, games, win_rate, rated_matches
-- PLUS the head-to-head fields (from the caller's perspective):
--   opponent_wins, opponent_losses, opponent_draws,
--   opponent_games, last_played_at, match_count
-- It NEVER returns: auth UUID, email, RD, volatility, tokens, IP,
-- moderation notes, private settings, or any field the opponent
-- has set to PRIVATE.
--
-- The head-to-head record is derived from match_participants.result
-- for the CALLING user (WIN = caller won, LOSS = caller lost, DRAW).
-- ABORT results are excluded from the head-to-head (no outcome).
--
-- Authentication required: auth.uid() is the caller. Anonymous users
-- have no match history and receive an empty result.
-- ═══════════════════════════════════════════════════════════════

-- ── Index for opponent lookup ──
-- Accelerates the self-join on match_participants to find the other
-- participant in each match the caller played.
CREATE INDEX IF NOT EXISTS match_participants_user_id_idx
  ON public.match_participants (user_id);

CREATE INDEX IF NOT EXISTS match_participants_match_id_idx
  ON public.match_participants (match_id);

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_recent_opponents
--
-- Returns opponents the authenticated user has faced in completed
-- matches, ordered by most recent match first. Each opponent appears
-- once with an aggregated head-to-head record.
--
-- Parameters:
--   p_limit  — max opponents to return (default 25, max 100)
--   p_offset — pagination offset (default 0)
--
-- Returns the same safe public columns as get_player_directory, plus
-- head-to-head fields. earned_achievement_count is included only when
-- the opponent's achievements privacy is PUBLIC.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_recent_opponents(
  p_limit  integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id        text,
  display_name            text,
  handle                  text,
  avatar_url              text,
  rating                  integer,
  tier                    text,
  division                text,
  is_apex                 boolean,
  is_placement            boolean,
  wins                    integer,
  losses                  integer,
  draws                   integer,
  games                   integer,
  win_rate                double precision,
  rated_matches           integer,
  earned_achievement_count integer,
  -- Head-to-head fields (from the CALLER's perspective)
  opponent_wins           integer,
  opponent_losses         integer,
  opponent_draws          integer,
  opponent_games          integer,
  last_played_at          timestamptz,
  match_count             integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  integer;
  v_offset integer;
  v_season text;
  v_caller uuid := auth.uid();
BEGIN
  -- Anonymous or unauthenticated → empty result
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- Resolve the active ranked season once (for the rating join)
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;
  IF v_season IS NULL THEN v_season := 'season-1'; END IF;

  RETURN QUERY
  WITH caller_matches AS (
    -- All matches the caller participated in (excluding ABORT — no outcome)
    SELECT mp.match_id, mp.result, m.ended_at
    FROM public.match_participants mp
    JOIN public.matches m ON m.match_id = mp.match_id
    WHERE mp.user_id = v_caller
      AND m.status = 'COMPLETED'
      AND mp.result IN ('WIN', 'LOSS', 'DRAW')
  ),
  opponent_matches AS (
    -- For each caller match, find the other participant
    SELECT
      cmp.match_id,
      cmp.result AS caller_result,
      cmp.ended_at,
      omp.user_id AS opponent_user_id
    FROM caller_matches cmp
    JOIN public.match_participants omp
      ON omp.match_id = cmp.match_id
      AND omp.user_id <> v_caller
  ),
  -- Aggregate head-to-head per opponent
  opponent_stats AS (
    SELECT
      om.opponent_user_id,
      count(*) AS match_count,
      count(*) FILTER (WHERE om.caller_result = 'WIN')  AS h2h_wins,
      count(*) FILTER (WHERE om.caller_result = 'LOSS') AS h2h_losses,
      count(*) FILTER (WHERE om.caller_result = 'DRAW') AS h2h_draws,
      max(om.ended_at) AS last_played_at
    FROM opponent_matches om
    GROUP BY om.opponent_user_id
  )
  SELECT
    p.public_player_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    pr.rating,
    CASE
      WHEN pr.rating IS NULL OR pr.provisional OR pr.placements_played < 5 THEN 'UNRANKED'
      WHEN pr.rating >= 2400 THEN 'INTRILEX'
      WHEN pr.rating >= 2200 THEN 'SOVEREIGN'
      WHEN pr.rating >= 2000 THEN 'PARAGON'
      WHEN pr.rating >= 1800 THEN 'ASCENDANT'
      WHEN pr.rating >= 1600 THEN 'VANGUARD'
      WHEN pr.rating >= 1400 THEN 'WARDEN'
      WHEN pr.rating >= 1200 THEN 'CIPHER'
      ELSE 'INITIATE'
    END AS tier,
    CASE
      WHEN pr.rating IS NULL OR pr.provisional OR pr.placements_played < 5 THEN 'NONE'
      WHEN pr.rating >= 2400 THEN 'NONE'
      WHEN mod(pr.rating - (CASE
        WHEN pr.rating >= 2200 THEN 2200 WHEN pr.rating >= 2000 THEN 2000
        WHEN pr.rating >= 1800 THEN 1800 WHEN pr.rating >= 1600 THEN 1600
        WHEN pr.rating >= 1400 THEN 1400 WHEN pr.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 67 THEN 'III'
      WHEN mod(pr.rating - (CASE
        WHEN pr.rating >= 2200 THEN 2200 WHEN pr.rating >= 2000 THEN 2000
        WHEN pr.rating >= 1800 THEN 1800 WHEN pr.rating >= 1600 THEN 1600
        WHEN pr.rating >= 1400 THEN 1400 WHEN pr.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 134 THEN 'II'
      ELSE 'I'
    END AS division,
    (pr.rating IS NOT NULL AND pr.rating >= 2400 AND pr.provisional = false AND pr.placements_played >= 5) AS is_apex,
    (pr.rating IS NULL OR pr.provisional OR pr.placements_played < 5) AS is_placement,
    COALESCE(pr.wins, 0) AS wins,
    COALESCE(pr.losses, 0) AS losses,
    COALESCE(pr.draws, 0) AS draws,
    COALESCE(pr.wins, 0) + COALESCE(pr.losses, 0) + COALESCE(pr.draws, 0) AS games,
    CASE WHEN COALESCE(pr.wins,0) + COALESCE(pr.losses,0) + COALESCE(pr.draws,0) > 0
      THEN COALESCE(pr.wins,0)::double precision / (COALESCE(pr.wins,0) + COALESCE(pr.losses,0) + COALESCE(pr.draws,0))
      ELSE 0 END AS win_rate,
    COALESCE(pr.rated_matches, 0) AS rated_matches,
    -- Achievement count only when the opponent's achievements are PUBLIC
    CASE WHEN COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'
      THEN (SELECT count(*) FROM public.account_achievements a WHERE a.user_id = os.opponent_user_id)
      ELSE NULL
    END AS earned_achievement_count,
    -- Head-to-head (caller's perspective)
    os.h2h_wins AS opponent_wins,
    os.h2h_losses AS opponent_losses,
    os.h2h_draws AS opponent_draws,
    (os.h2h_wins + os.h2h_losses + os.h2h_draws) AS opponent_games,
    os.last_played_at,
    os.match_count
  FROM opponent_stats os
  JOIN public.profiles p ON p.user_id = os.opponent_user_id
  LEFT JOIN public.profile_privacy pp ON pp.user_id = os.opponent_user_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = os.opponent_user_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = os.opponent_user_id
  WHERE (m.status IS NULL OR m.status = 'ACTIVE')
  ORDER BY os.last_played_at DESC NULLS LAST,
           os.match_count DESC,
           p.public_player_id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- Grant execute to authenticated only (requires auth.uid() for caller identity)
GRANT EXECUTE ON FUNCTION public.get_recent_opponents TO authenticated;
