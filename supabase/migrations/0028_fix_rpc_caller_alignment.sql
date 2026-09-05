-- ═══════════════════════════════════════════════════════════════
-- 0028_fix_rpc_caller_alignment.sql
--
-- Fixes RPC signature and return-column drift between Supabase RPCs
-- and their application callers. Five RPCs were identified as broken:
--
--   1. get_ranked_leaderboard — params and return columns mismatch
--      Caller sends p_tier_filter + p_search; RPC expected p_tier + p_division.
--      Caller reads wins/losses/draws; RPC didn't return them.
--
--   2. get_player_standing — param name and return columns mismatch
--      Caller sends p_user_id; RPC expected p_target_user_id.
--      Caller reads wins/losses/draws/peak_rating/placements_played/position;
--      RPC returned rank_position and omitted W/L/D/peak/placements.
--
--   3. get_recent_opponents — semantic mismatch
--      RPC returned per-match rows; caller expects aggregated head-to-head
--      per opponent (opponent_wins, opponent_losses, opponent_draws,
--      match_count, last_played_at, earned_achievement_count).
--
--   4. get_self_profile — missing directoryVisible field
--      Caller reads data.directoryVisible; RPC didn't include it.
--
--   5. get_public_profile — season-1 fabrication still present
--      RPC hardcoded 'seasonId', 'season-1' in recent matches JSON.
--      Should use COALESCE(m.season_id, '') like get_self_profile (fixed in 0022).
--
-- IRX-C03: Functions 1-3 have return-type changes → DROP + CREATE.
-- Functions 4-5 are jsonb returns → CREATE OR REPLACE is safe.
-- ═══════════════════════════════════════════════════════════════

-- ── IRX-C03: DROP functions whose return types changed ──
DROP FUNCTION IF EXISTS public.get_ranked_leaderboard(text, text, text, text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_player_standing(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_recent_opponents(integer, integer) CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 1. get_ranked_leaderboard — aligned with leaderboard-data.js + leaderboard-repository.mjs
--
-- Caller params:  p_season_id, p_queue_id, p_tier_filter, p_search, p_limit, p_offset
-- Caller reads:   public_player_id, display_name, handle, avatar_url, rating,
--                 rated_matches, wins, losses, draws, tier, division, is_apex
-- ═══════════════════════════════════════════════════════════════
CREATE FUNCTION public.get_ranked_leaderboard(
  p_season_id   text   DEFAULT NULL,
  p_queue_id    text   DEFAULT 'ranked',
  p_tier_filter text   DEFAULT NULL,
  p_search      text   DEFAULT NULL,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id text,
  display_name     text,
  handle           text,
  avatar_url       text,
  rating           integer,
  rated_matches    integer,
  wins             integer,
  losses           integer,
  draws            integer,
  tier             text,
  division         text,
  is_apex          boolean,
  is_placement     boolean,
  rank_position    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season text;
  v_limit  integer;
  v_offset integer;
  v_search text;
BEGIN
  v_season := p_season_id;
  IF v_season IS NULL THEN
    SELECT season_id INTO v_season
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
  END IF;
  IF v_season IS NULL THEN
    RETURN;
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  SELECT
    p.public_player_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    pr.rating,
    COALESCE(pr.rated_matches, 0) AS rated_matches,
    COALESCE(pr.wins, 0) AS wins,
    COALESCE(pr.losses, 0) AS losses,
    COALESCE(pr.draws, 0) AS draws,
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
    ROW_NUMBER() OVER (ORDER BY pr.rating DESC NULLS LAST) AS rank_position
  FROM public.profiles p
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = p_queue_id AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE (m.status IS NULL OR m.status = 'ACTIVE')
    AND (
      p_tier_filter IS NULL OR
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
      END = p_tier_filter
    )
    AND (
      v_search IS NULL OR
      p.display_name ILIKE '%' || v_search || '%' OR
      p.handle ILIKE '%' || v_search || '%'
    )
  ORDER BY pr.rating DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. get_player_standing — aligned with leaderboard-data.js + leaderboard-repository.mjs
--
-- Caller params:  p_season_id, p_queue_id, p_user_id
-- Caller reads:   public_player_id, display_name, handle, avatar_url, rating,
--                 rated_matches, wins, losses, draws, tier, division, is_apex,
--                 is_placement, peak_rating, placements_played, position
-- ═══════════════════════════════════════════════════════════════
CREATE FUNCTION public.get_player_standing(
  p_season_id text DEFAULT NULL,
  p_queue_id  text DEFAULT 'ranked',
  p_user_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  public_player_id  text,
  display_name      text,
  handle            text,
  avatar_url        text,
  rating            integer,
  rated_matches     integer,
  wins              integer,
  losses            integer,
  draws             integer,
  tier              text,
  division          text,
  is_apex           boolean,
  is_placement      boolean,
  peak_rating       integer,
  placements_played integer,
  position          bigint,
  total_players     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season text;
  v_user   uuid;
BEGIN
  v_season := p_season_id;
  IF v_season IS NULL THEN
    SELECT season_id INTO v_season
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
  END IF;
  IF v_season IS NULL THEN
    RETURN;
  END IF;

  v_user := p_user_id;
  IF v_user IS NULL THEN
    v_user := auth.uid();
  END IF;
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.user_id,
      p.public_player_id,
      p.display_name,
      p.handle,
      p.avatar_url,
      pr.rating,
      pr.provisional,
      pr.placements_played,
      pr.rated_matches,
      pr.wins,
      pr.losses,
      pr.draws,
      pr.peak_rating,
      ROW_NUMBER() OVER (ORDER BY pr.rating DESC NULLS LAST) AS pos
    FROM public.profiles p
    LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
      AND pr.queue_id = p_queue_id AND pr.season_id = v_season
    LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
    WHERE (m.status IS NULL OR m.status = 'ACTIVE')
  )
  SELECT
    r.public_player_id,
    r.display_name,
    r.handle,
    r.avatar_url,
    r.rating,
    COALESCE(r.rated_matches, 0) AS rated_matches,
    COALESCE(r.wins, 0) AS wins,
    COALESCE(r.losses, 0) AS losses,
    COALESCE(r.draws, 0) AS draws,
    CASE
      WHEN r.rating IS NULL OR r.provisional OR r.placements_played < 5 THEN 'UNRANKED'
      WHEN r.rating >= 2400 THEN 'INTRILEX'
      WHEN r.rating >= 2200 THEN 'SOVEREIGN'
      WHEN r.rating >= 2000 THEN 'PARAGON'
      WHEN r.rating >= 1800 THEN 'ASCENDANT'
      WHEN r.rating >= 1600 THEN 'VANGUARD'
      WHEN r.rating >= 1400 THEN 'WARDEN'
      WHEN r.rating >= 1200 THEN 'CIPHER'
      ELSE 'INITIATE'
    END AS tier,
    CASE
      WHEN r.rating IS NULL OR r.provisional OR r.placements_played < 5 THEN 'NONE'
      WHEN r.rating >= 2400 THEN 'NONE'
      WHEN mod(r.rating - (CASE
        WHEN r.rating >= 2200 THEN 2200 WHEN r.rating >= 2000 THEN 2000
        WHEN r.rating >= 1800 THEN 1800 WHEN r.rating >= 1600 THEN 1600
        WHEN r.rating >= 1400 THEN 1400 WHEN r.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 67 THEN 'III'
      WHEN mod(r.rating - (CASE
        WHEN r.rating >= 2200 THEN 2200 WHEN r.rating >= 2000 THEN 2000
        WHEN r.rating >= 1800 THEN 1800 WHEN r.rating >= 1600 THEN 1600
        WHEN r.rating >= 1400 THEN 1400 WHEN r.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 134 THEN 'II'
      ELSE 'I'
    END AS division,
    (r.rating IS NOT NULL AND r.rating >= 2400 AND r.provisional = false AND r.placements_played >= 5) AS is_apex,
    (r.rating IS NULL OR r.provisional OR r.placements_played < 5) AS is_placement,
    r.peak_rating,
    COALESCE(r.placements_played, 0) AS placements_played,
    r.pos AS position,
    (SELECT count(*) FROM ranked) AS total_players
  FROM ranked r
  WHERE r.user_id = v_user;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. get_recent_opponents — aggregated head-to-head per opponent
--
-- Caller (toOpponentEntry) reads:
--   public_player_id/display_name/handle/avatar_url (opponent identity)
--   rating, rated_matches, wins, losses, draws (opponent's overall record)
--   opponent_wins, opponent_losses, opponent_draws (head-to-head from caller's perspective)
--   match_count, last_played_at, earned_achievement_count
-- ═══════════════════════════════════════════════════════════════
CREATE FUNCTION public.get_recent_opponents(
  p_limit  integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  opponent_public_id        text,
  opponent_display_name     text,
  opponent_handle           text,
  opponent_avatar_url       text,
  opponent_rating           integer,
  opponent_rated_matches    integer,
  opponent_wins             integer,
  opponent_losses           integer,
  opponent_draws            integer,
  opponent_wins_h2h         integer,
  opponent_losses_h2h       integer,
  opponent_draws_h2h        integer,
  match_count               integer,
  last_played_at            timestamptz,
  earned_achievement_count  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_season text;
  v_limit  integer;
  v_offset integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  RETURN QUERY
  WITH opponent_matches AS (
    SELECT
      omp.user_id AS opponent_user_id,
      mp.result AS caller_result,
      m.ended_at,
      m.match_id
    FROM public.match_participants mp
    JOIN public.matches m ON m.match_id = mp.match_id
    JOIN public.match_participants omp
      ON omp.match_id = mp.match_id AND omp.user_id <> mp.user_id
    WHERE mp.user_id = v_caller
      AND m.status IN ('COMPLETED', 'ABORTED', 'EXPIRED')
  ),
  aggregated AS (
    SELECT
      om.opponent_user_id,
      count(*) AS match_count,
      max(om.ended_at) AS last_played_at,
      count(*) FILTER (WHERE om.caller_result = 'WIN') AS h2h_wins,
      count(*) FILTER (WHERE om.caller_result = 'LOSS') AS h2h_losses,
      count(*) FILTER (WHERE om.caller_result = 'DRAW') AS h2h_draws
    FROM opponent_matches om
    GROUP BY om.opponent_user_id
  )
  SELECT
    op.public_player_id AS opponent_public_id,
    op.display_name AS opponent_display_name,
    op.handle AS opponent_handle,
    op.avatar_url AS opponent_avatar_url,
    opr.rating AS opponent_rating,
    COALESCE(opr.rated_matches, 0) AS opponent_rated_matches,
    COALESCE(opr.wins, 0) AS opponent_wins,
    COALESCE(opr.losses, 0) AS opponent_losses,
    COALESCE(opr.draws, 0) AS opponent_draws,
    a.h2h_wins AS opponent_wins_h2h,
    a.h2h_losses AS opponent_losses_h2h,
    a.h2h_draws AS opponent_draws_h2h,
    a.match_count,
    a.last_played_at,
    (SELECT count(*) FROM public.account_achievements aa
       WHERE aa.user_id = op.user_id) AS earned_achievement_count
  FROM aggregated a
  JOIN public.profiles op ON op.user_id = a.opponent_user_id
  LEFT JOIN public.player_ratings opr ON opr.user_id = a.opponent_user_id
    AND opr.queue_id = 'ranked' AND opr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = op.user_id
  WHERE (m.status IS NULL OR m.status = 'ACTIVE')
  ORDER BY a.last_played_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ── Re-grant privileges on recreated functions ──
GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- 4. get_self_profile — add directoryVisible field
--
-- Caller (profile-data.js:331) reads data.directoryVisible.
-- The RPC already reads profile_privacy but did not include directory_visible
-- in the returned jsonb.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_self_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_public_id     text;
  v_display       text;
  v_handle        text;
  v_avatar        text;
  v_joined        timestamptz;
  v_title_id      text;
  v_frame_id      text;
  v_card_back_id  text;
  v_priv_mh       text;
  v_priv_ach      text;
  v_priv_os       text;
  v_priv_ls       text;
  v_dir_visible   boolean;
  v_is_guest      boolean;
  v_rating        integer;
  v_rated_matches integer;
  v_wins          integer;
  v_losses        integer;
  v_draws         integer;
  v_peak          integer;
  v_placements    integer;
  v_provisional   boolean;
  v_position      integer;
  v_ach_count     integer;
  v_showcase      jsonb;
  v_recent        jsonb;
  v_seasons       jsonb;
  v_online_m      integer;
  v_online_w      integer;
  v_online_l      integer;
  v_online_d      integer;
  v_ranked_m      integer;
  v_ranked_w      integer;
  v_ranked_l      integer;
  v_cur_streak    integer;
  v_best_streak   integer;
  v_tier          text;
  v_division      text;
  v_peak_tier     text;
  v_peak_div      text;
  v_is_apex       boolean;
  v_active_season text;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT p.public_player_id, p.display_name, p.handle, p.avatar_url, p.created_at
    INTO v_public_id, v_display, v_handle, v_avatar, v_joined
    FROM public.profiles p WHERE p.user_id = v_user_id;
  IF v_public_id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  v_is_guest := false;

  SELECT title_id, profile_frame_id, card_back_id
    INTO v_title_id, v_frame_id, v_card_back_id
    FROM public.profile_customization WHERE user_id = v_user_id;
  IF v_title_id IS NULL THEN v_title_id := 'none'; v_frame_id := 'none'; v_card_back_id := 'default'; END IF;

  SELECT match_history, achievements, online_status, local_stats, directory_visible
    INTO v_priv_mh, v_priv_ach, v_priv_os, v_priv_ls, v_dir_visible
    FROM public.profile_privacy WHERE user_id = v_user_id;
  IF v_priv_mh IS NULL THEN v_priv_mh := 'PUBLIC'; v_priv_ach := 'PUBLIC'; v_priv_os := 'PRIVATE'; v_priv_ls := 'PRIVATE'; END IF;
  IF v_dir_visible IS NULL THEN v_dir_visible := false; END IF;

  SELECT season_id INTO v_active_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  SELECT pr.rating, pr.rated_matches, pr.wins, pr.losses, pr.draws, pr.peak_rating,
         pr.placements_played, pr.provisional
    INTO v_rating, v_rated_matches, v_wins, v_losses, v_draws, v_peak, v_placements, v_provisional
    FROM public.player_ratings pr
    JOIN public.ranked_seasons s ON s.season_id = pr.season_id
    WHERE pr.user_id = v_user_id AND pr.queue_id = 'ranked' AND s.status = 'ACTIVE' LIMIT 1;

  v_position := NULL;
  v_tier := NULL; v_division := NULL; v_is_apex := false; v_peak_tier := NULL; v_peak_div := NULL;
  IF v_rating IS NOT NULL AND v_provisional = false AND v_placements >= 5 THEN
    SELECT pos INTO v_position FROM (
      SELECT pr.user_id, ROW_NUMBER() OVER (
        ORDER BY pr.rating DESC, pr.rating_deviation ASC, pr.rated_matches DESC,
                 pr.last_rated_at DESC NULLS LAST, p.public_player_id ASC
      ) AS pos
      FROM public.player_ratings pr JOIN public.profiles p ON p.user_id = pr.user_id
      LEFT JOIN public.account_moderation m ON m.user_id = pr.user_id
      WHERE pr.queue_id = 'ranked' AND pr.season_id = v_active_season
        AND pr.provisional = false AND pr.placements_played >= 5
        AND (m.status IS NULL OR m.status = 'ACTIVE')
    ) ranked WHERE ranked.user_id = v_user_id;
    v_tier := CASE WHEN v_rating >= 2400 THEN 'INTRILEX' WHEN v_rating >= 2200 THEN 'SOVEREIGN'
      WHEN v_rating >= 2000 THEN 'PARAGON' WHEN v_rating >= 1800 THEN 'ASCENDANT'
      WHEN v_rating >= 1600 THEN 'VANGUARD' WHEN v_rating >= 1400 THEN 'WARDEN'
      WHEN v_rating >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END;
    v_division := CASE WHEN v_rating >= 2400 THEN NULL
      WHEN mod(v_rating - (CASE WHEN v_rating >= 2200 THEN 2200 WHEN v_rating >= 2000 THEN 2000
        WHEN v_rating >= 1800 THEN 1800 WHEN v_rating >= 1600 THEN 1600 WHEN v_rating >= 1400 THEN 1400
        WHEN v_rating >= 1200 THEN 1200 ELSE 0 END), 200) < 67 THEN 'III'
      WHEN mod(v_rating - (CASE WHEN v_rating >= 2200 THEN 2200 WHEN v_rating >= 2000 THEN 2000
        WHEN v_rating >= 1800 THEN 1800 WHEN v_rating >= 1600 THEN 1600 WHEN v_rating >= 1400 THEN 1400
        WHEN v_rating >= 1200 THEN 1200 ELSE 0 END), 200) < 134 THEN 'II' ELSE 'I' END;
    v_is_apex := v_rating >= 2400;
    IF v_peak IS NOT NULL THEN
      v_peak_tier := CASE WHEN v_peak >= 2400 THEN 'INTRILEX' WHEN v_peak >= 2200 THEN 'SOVEREIGN'
        WHEN v_peak >= 2000 THEN 'PARAGON' WHEN v_peak >= 1800 THEN 'ASCENDANT'
        WHEN v_peak >= 1600 THEN 'VANGUARD' WHEN v_peak >= 1400 THEN 'WARDEN'
        WHEN v_peak >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END;
      v_peak_div := CASE WHEN v_peak >= 2400 THEN NULL
        WHEN mod(v_peak - (CASE WHEN v_peak >= 2200 THEN 2200 WHEN v_peak >= 2000 THEN 2000
          WHEN v_peak >= 1800 THEN 1800 WHEN v_peak >= 1600 THEN 1600 WHEN v_peak >= 1400 THEN 1400
          WHEN v_peak >= 1200 THEN 1200 ELSE 0 END), 200) < 67 THEN 'III'
        WHEN mod(v_peak - (CASE WHEN v_peak >= 2200 THEN 2200 WHEN v_peak >= 2000 THEN 2000
          WHEN v_peak >= 1800 THEN 1800 WHEN v_peak >= 1600 THEN 1600 WHEN v_peak >= 1400 THEN 1400
          WHEN v_peak >= 1200 THEN 1200 ELSE 0 END), 200) < 134 THEN 'II' ELSE 'I' END;
    END IF;
  END IF;

  SELECT count(*) INTO v_ach_count FROM public.account_achievements WHERE user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'slot', slot, 'type', item_type, 'itemId', item_id
  ) ORDER BY slot), '[]'::jsonb) INTO v_showcase
  FROM public.profile_showcase WHERE user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'matchId', mp.match_id, 'result', mp.result,
    'ratingDelta', mp.rating_delta, 'timestamp', m.ended_at, 'seasonId', COALESCE(m.season_id, '')
  ) ORDER BY m.ended_at DESC), '[]'::jsonb) INTO v_recent
  FROM public.match_participants mp JOIN public.matches m ON m.match_id = mp.match_id
  WHERE mp.user_id = v_user_id AND m.status = 'COMPLETED' LIMIT 20;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seasonId', a.season_id, 'name', s.name, 'status', 'ARCHIVED',
    'finalRating', a.final_rating, 'finalPosition', a.final_position,
    'finalTier', a.final_tier, 'finalDivision', a.final_division,
    'peakRating', a.peak_rating, 'peakTier', a.peak_tier, 'peakDivision', a.peak_division,
    'wins', a.wins, 'losses', a.losses, 'draws', a.draws, 'games', a.games, 'isCurrent', false
  ) ORDER BY a.final_position NULLS LAST), '[]'::jsonb) INTO v_seasons
  FROM public.ranked_season_archive a JOIN public.ranked_seasons s ON s.season_id = a.season_id
  WHERE a.user_id = v_user_id;

  SELECT online_matches, online_wins, online_losses, online_draws,
         ranked_matches, ranked_wins, ranked_losses, current_win_streak, best_win_streak
    INTO v_online_m, v_online_w, v_online_l, v_online_d,
         v_ranked_m, v_ranked_w, v_ranked_l, v_cur_streak, v_best_streak
    FROM public.player_stats WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'found', true,
    'identity', jsonb_build_object(
      'publicPlayerId', v_public_id, 'displayName', v_display, 'handle', v_handle,
      'avatarUrl', v_avatar, 'joinedAt', v_joined,
      'accountType', CASE WHEN v_is_guest THEN 'GUEST' ELSE 'PERMANENT' END,
      'titleId', v_title_id, 'profileFrameId', v_frame_id, 'cardBackId', v_card_back_id
    ),
    'ranked', CASE WHEN v_rating IS NULL THEN NULL ELSE jsonb_build_object(
      'available', true, 'isPlacement', (v_provisional OR v_placements < 5),
      'placementsPlayed', LEAST(v_placements, 5), 'placementsRequired', 5,
      'tier', v_tier, 'division', v_division, 'rating', v_rating,
      'leaderboardPosition', v_position,
      'wins', v_wins, 'losses', v_losses, 'draws', v_draws,
      'games', (v_wins + v_losses + v_draws),
      'winRate', CASE WHEN (v_wins + v_losses + v_draws) > 0
        THEN v_wins::double precision / (v_wins + v_losses + v_draws) ELSE NULL END,
      'peakRating', v_peak, 'peakTier', v_peak_tier, 'peakDivision', v_peak_div, 'isApex', v_is_apex
    ) END,
    'achievements', jsonb_build_object('earnedCount', v_ach_count, 'totalCount', 56, 'achievementPoints', NULL, 'maxAp', 1320),
    'showcase', v_showcase,
    'recentMatches', v_recent,
    'seasonHistory', v_seasons,
    'privacy', jsonb_build_object(
      'matchHistory', v_priv_mh, 'achievements', v_priv_ach,
      'onlineStatus', v_priv_os, 'localStats', v_priv_ls
    ),
    'directoryVisible', v_dir_visible,
    'onlineStats', CASE WHEN v_online_m IS NULL THEN NULL ELSE jsonb_build_object(
      'onlineMatches', v_online_m, 'onlineWins', v_online_w, 'onlineLosses', v_online_l,
      'onlineDraws', v_online_d, 'rankedMatches', v_ranked_m, 'rankedWins', v_ranked_w,
      'rankedLosses', v_ranked_l, 'currentWinStreak', v_cur_streak, 'bestWinStreak', v_best_streak
    ) END,
    'isSelf', true
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. get_public_profile — remove 'season-1' fabrication
--
-- Migration 0022 fixed get_self_profile but NOT get_public_profile.
-- The function still hardcoded 'seasonId', 'season-1' in recent matches.
-- This CREATE OR REPLACE replaces it with COALESCE(m.season_id, '').
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_public_profile(
  p_handle_or_public_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_public_id     text;
  v_display       text;
  v_handle        text;
  v_avatar        text;
  v_joined        timestamptz;
  v_title_id      text;
  v_frame_id      text;
  v_card_back_id  text;
  v_priv_mh       text;
  v_priv_ach      text;
  v_is_guest      boolean;
  v_rating        integer;
  v_rated_matches integer;
  v_wins          integer;
  v_losses        integer;
  v_draws         integer;
  v_peak          integer;
  v_placements    integer;
  v_provisional   boolean;
  v_position      integer;
  v_ach_count     integer;
  v_showcase      jsonb;
  v_recent        jsonb;
  v_seasons       jsonb;
  v_tier          text;
  v_division      text;
  v_peak_tier     text;
  v_peak_div      text;
  v_is_apex       boolean;
  v_active_season text;
BEGIN
  -- Resolve user by handle (case-insensitive) or public_player_id
  SELECT p.user_id, p.public_player_id, p.display_name, p.handle, p.avatar_url, p.created_at
    INTO v_user_id, v_public_id, v_display, v_handle, v_avatar, v_joined
    FROM public.profiles p
    LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
    WHERE (lower(p.handle) = lower(p_handle_or_public_id)
           OR p.public_player_id = p_handle_or_public_id)
      AND (m.status IS NULL OR m.status = 'ACTIVE');
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  v_is_guest := false;

  SELECT title_id, profile_frame_id, card_back_id
    INTO v_title_id, v_frame_id, v_card_back_id
    FROM public.profile_customization WHERE user_id = v_user_id;
  IF v_title_id IS NULL THEN v_title_id := 'none'; v_frame_id := 'none'; v_card_back_id := 'default'; END IF;

  SELECT achievements, match_history
    INTO v_priv_ach, v_priv_mh
    FROM public.profile_privacy WHERE user_id = v_user_id;
  IF v_priv_ach IS NULL THEN v_priv_ach := 'PUBLIC'; END IF;
  IF v_priv_mh IS NULL THEN v_priv_mh := 'PUBLIC'; END IF;

  SELECT season_id INTO v_active_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  SELECT pr.rating, pr.rated_matches, pr.wins, pr.losses, pr.draws, pr.peak_rating,
         pr.placements_played, pr.provisional
    INTO v_rating, v_rated_matches, v_wins, v_losses, v_draws, v_peak, v_placements, v_provisional
    FROM public.player_ratings pr
    JOIN public.ranked_seasons s ON s.season_id = pr.season_id
    WHERE pr.user_id = v_user_id AND pr.queue_id = 'ranked' AND s.status = 'ACTIVE' LIMIT 1;

  v_position := NULL;
  v_tier := NULL; v_division := NULL; v_is_apex := false; v_peak_tier := NULL; v_peak_div := NULL;
  IF v_rating IS NOT NULL AND v_provisional = false AND v_placements >= 5 THEN
    SELECT pos INTO v_position FROM (
      SELECT pr.user_id, ROW_NUMBER() OVER (
        ORDER BY pr.rating DESC, pr.rating_deviation ASC, pr.rated_matches DESC,
                 pr.last_rated_at DESC NULLS LAST, p.public_player_id ASC
      ) AS pos
      FROM public.player_ratings pr JOIN public.profiles p ON p.user_id = pr.user_id
      LEFT JOIN public.account_moderation m ON m.user_id = pr.user_id
      WHERE pr.queue_id = 'ranked' AND pr.season_id = v_active_season
        AND pr.provisional = false AND pr.placements_played >= 5
        AND (m.status IS NULL OR m.status = 'ACTIVE')
    ) ranked WHERE ranked.user_id = v_user_id;
    v_tier := CASE WHEN v_rating >= 2400 THEN 'INTRILEX' WHEN v_rating >= 2200 THEN 'SOVEREIGN'
      WHEN v_rating >= 2000 THEN 'PARAGON' WHEN v_rating >= 1800 THEN 'ASCENDANT'
      WHEN v_rating >= 1600 THEN 'VANGUARD' WHEN v_rating >= 1400 THEN 'WARDEN'
      WHEN v_rating >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END;
    v_division := CASE WHEN v_rating >= 2400 THEN NULL
      WHEN mod(v_rating - (CASE WHEN v_rating >= 2200 THEN 2200 WHEN v_rating >= 2000 THEN 2000
        WHEN v_rating >= 1800 THEN 1800 WHEN v_rating >= 1600 THEN 1600 WHEN v_rating >= 1400 THEN 1400
        WHEN v_rating >= 1200 THEN 1200 ELSE 0 END), 200) < 67 THEN 'III'
      WHEN mod(v_rating - (CASE WHEN v_rating >= 2200 THEN 2200 WHEN v_rating >= 2000 THEN 2000
        WHEN v_rating >= 1800 THEN 1800 WHEN v_rating >= 1600 THEN 1600 WHEN v_rating >= 1400 THEN 1400
        WHEN v_rating >= 1200 THEN 1200 ELSE 0 END), 200) < 134 THEN 'II' ELSE 'I' END;
    v_is_apex := v_rating >= 2400;
    IF v_peak IS NOT NULL THEN
      v_peak_tier := CASE WHEN v_peak >= 2400 THEN 'INTRILEX' WHEN v_peak >= 2200 THEN 'SOVEREIGN'
        WHEN v_peak >= 2000 THEN 'PARAGON' WHEN v_peak >= 1800 THEN 'ASCENDANT'
        WHEN v_peak >= 1600 THEN 'VANGUARD' WHEN v_peak >= 1400 THEN 'WARDEN'
        WHEN v_peak >= 1200 THEN 'CIPHER' ELSE 'INITIATE' END;
      v_peak_div := CASE WHEN v_peak >= 2400 THEN NULL
        WHEN mod(v_peak - (CASE WHEN v_peak >= 2200 THEN 2200 WHEN v_peak >= 2000 THEN 2000
          WHEN v_peak >= 1800 THEN 1800 WHEN v_peak >= 1600 THEN 1600 WHEN v_peak >= 1400 THEN 1400
          WHEN v_peak >= 1200 THEN 1200 ELSE 0 END), 200) < 67 THEN 'III'
        WHEN mod(v_peak - (CASE WHEN v_peak >= 2200 THEN 2200 WHEN v_peak >= 2000 THEN 2000
          WHEN v_peak >= 1800 THEN 1800 WHEN v_peak >= 1600 THEN 1600 WHEN v_peak >= 1400 THEN 1400
          WHEN v_peak >= 1200 THEN 1200 ELSE 0 END), 200) < 134 THEN 'II' ELSE 'I' END;
    END IF;
  END IF;

  -- Achievement summary (only if public)
  v_ach_count := NULL;
  IF v_priv_ach = 'PUBLIC' THEN
    SELECT count(*) INTO v_ach_count FROM public.account_achievements WHERE user_id = v_user_id;
  END IF;

  -- Showcase (filter achievements if private)
  IF v_priv_ach = 'PUBLIC' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slot', slot, 'type', item_type, 'itemId', item_id
    ) ORDER BY slot), '[]'::jsonb) INTO v_showcase
    FROM public.profile_showcase WHERE user_id = v_user_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slot', slot, 'type', item_type, 'itemId', item_id
    ) ORDER BY slot), '[]'::jsonb) INTO v_showcase
    FROM public.profile_showcase WHERE user_id = v_user_id AND item_type = 'BADGE';
  END IF;

  -- Recent matches (only if public) — IRX-C03/IRX-H07: use real season_id, not 'season-1'
  v_recent := NULL;
  IF v_priv_mh = 'PUBLIC' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'matchId', mp.match_id, 'result', mp.result,
      'ratingDelta', mp.rating_delta, 'timestamp', m.ended_at, 'seasonId', COALESCE(m.season_id, '')
    ) ORDER BY m.ended_at DESC), '[]'::jsonb) INTO v_recent
    FROM public.match_participants mp JOIN public.matches m ON m.match_id = mp.match_id
    WHERE mp.user_id = v_user_id AND m.status = 'COMPLETED' LIMIT 10;
  END IF;

  -- Season history (only if public)
  v_seasons := NULL;
  IF v_priv_mh = 'PUBLIC' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'seasonId', a.season_id, 'name', s.name, 'status', 'ARCHIVED',
      'finalRating', a.final_rating, 'finalPosition', a.final_position,
      'finalTier', a.final_tier, 'finalDivision', a.final_division,
      'peakRating', a.peak_rating, 'peakTier', a.peak_tier, 'peakDivision', a.peak_division,
      'wins', a.wins, 'losses', a.losses, 'draws', a.draws, 'games', a.games, 'isCurrent', false
    ) ORDER BY a.final_position NULLS LAST), '[]'::jsonb) INTO v_seasons
    FROM public.ranked_season_archive a JOIN public.ranked_seasons s ON s.season_id = a.season_id
    WHERE a.user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'identity', jsonb_build_object(
      'publicPlayerId', v_public_id, 'displayName', v_display, 'handle', v_handle,
      'avatarUrl', v_avatar, 'joinedAt', v_joined,
      'accountType', CASE WHEN v_is_guest THEN 'GUEST' ELSE 'PERMANENT' END,
      'titleId', v_title_id, 'profileFrameId', v_frame_id, 'cardBackId', v_card_back_id
    ),
    'ranked', CASE WHEN v_rating IS NULL THEN NULL ELSE jsonb_build_object(
      'available', true, 'isPlacement', (v_provisional OR v_placements < 5),
      'placementsPlayed', LEAST(v_placements, 5), 'placementsRequired', 5,
      'tier', v_tier, 'division', v_division, 'rating', v_rating,
      'leaderboardPosition', v_position,
      'wins', v_wins, 'losses', v_losses, 'draws', v_draws,
      'games', (v_wins + v_losses + v_draws),
      'winRate', CASE WHEN (v_wins + v_losses + v_draws) > 0
        THEN v_wins::double precision / (v_wins + v_losses + v_draws) ELSE NULL END,
      'peakRating', v_peak, 'peakTier', v_peak_tier, 'peakDivision', v_peak_div, 'isApex', v_is_apex
    ) END,
    'achievements', CASE WHEN v_priv_ach = 'PUBLIC' THEN jsonb_build_object(
      'earnedCount', v_ach_count, 'totalCount', 56, 'achievementPoints', NULL, 'maxAp', 1320
    ) ELSE NULL END,
    'showcase', v_showcase,
    'recentMatches', v_recent,
    'seasonHistory', v_seasons,
    'privacy', jsonb_build_object(
      'achievementsVisible', v_priv_ach = 'PUBLIC',
      'matchHistoryVisible', v_priv_mh = 'PUBLIC'
    )
  );
END;
$$;

-- ── Re-assert grants on patched jsonb functions ──
GRANT EXECUTE ON FUNCTION public.get_self_profile TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_self_profile FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_profile TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_profile FROM PUBLIC;
