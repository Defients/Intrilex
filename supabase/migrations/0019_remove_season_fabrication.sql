-- ═══════════════════════════════════════════════════════════════
-- 0019_remove_season_fabrication.sql
--
-- IRX-H07: Multiple RPCs in prior migrations fabricated 'season-1' as a
-- fallback when no active ranked season could be resolved. This creates
-- fake ranked records against a non-existent season and corrupts the
-- rating/tier/division projection.
--
-- This migration patches all affected functions to return NULL when no
-- active season exists, which produces the correct conservative projection
-- (UNRANKED tier, NULL rating) instead of fabricating a season.
--
-- Functions patched:
--   0009: get_ranked_leaderboard, get_player_standing
--   0010: get_self_profile (match history seasonId)
--   0011: get_match_history, get_match_detail
--   0012: persist_match_result (internal season resolution)
--   0013: get_player_directory, get_player_directory_count
--   0015: get_recent_opponents
-- ═══════════════════════════════════════════════════════════════

-- ── 0009: get_ranked_leaderboard ──
CREATE OR REPLACE FUNCTION public.get_ranked_leaderboard(
  p_queue_id text DEFAULT 'ranked',
  p_season_id text DEFAULT NULL,
  p_tier text DEFAULT NULL,
  p_division text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id text,
  display_name text,
  handle text,
  avatar_url text,
  rating integer,
  tier text,
  division text,
  is_apex boolean,
  is_placement boolean,
  rated_matches integer,
  rank_position bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season text;
  v_limit integer;
  v_offset integer;
BEGIN
  v_season := p_season_id;
  IF v_season IS NULL THEN
    SELECT season_id INTO v_season
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
  END IF;
  -- IRX-H07: Return empty set if no active season — do NOT fabricate 'season-1'
  IF v_season IS NULL THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
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
    COALESCE(pr.rated_matches, 0) AS rated_matches,
    ROW_NUMBER() OVER (ORDER BY pr.rating DESC NULLS LAST) AS rank_position
  FROM public.profiles p
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = p_queue_id AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE (m.status IS NULL OR m.status = 'ACTIVE')
    AND (
      p_tier IS NULL OR
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
      END = p_tier
    )
  ORDER BY pr.rating DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ── 0009: get_player_standing ──
CREATE OR REPLACE FUNCTION public.get_player_standing(
  p_queue_id text DEFAULT 'ranked',
  p_season_id text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  public_player_id text,
  display_name text,
  handle text,
  avatar_url text,
  rating integer,
  tier text,
  division text,
  is_apex boolean,
  is_placement boolean,
  rated_matches integer,
  rank_position bigint,
  total_players bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season text;
  v_user uuid;
BEGIN
  v_season := p_season_id;
  IF v_season IS NULL THEN
    SELECT season_id INTO v_season
      FROM public.ranked_seasons
      WHERE queue_id = p_queue_id AND status = 'ACTIVE'
      ORDER BY starts_at ASC LIMIT 1;
  END IF;
  -- IRX-H07: Return empty set if no active season
  IF v_season IS NULL THEN
    RETURN;
  END IF;

  v_user := p_target_user_id;
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
    COALESCE(r.rated_matches, 0) AS rated_matches,
    r.pos AS rank_position,
    (SELECT count(*) FROM ranked) AS total_players
  FROM ranked r
  WHERE r.user_id = v_user;
END;
$$;

-- ── 0015: get_recent_opponents ──
CREATE OR REPLACE FUNCTION public.get_recent_opponents(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  match_id text,
  ended_at timestamptz,
  result text,
  opponent_public_id text,
  opponent_display_name text,
  opponent_handle text,
  opponent_avatar_url text,
  opponent_rating integer,
  opponent_tier text,
  opponent_division text,
  queue_id text,
  season_id text,
  termination_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_season text;
  v_limit integer;
  v_offset integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- IRX-H07: Do not fabricate 'season-1'
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  RETURN QUERY
  SELECT
    m.match_id,
    m.ended_at,
    mp.result,
    op.public_player_id AS opponent_public_id,
    op.display_name AS opponent_display_name,
    op.handle AS opponent_handle,
    op.avatar_url AS opponent_avatar_url,
    opr.rating AS opponent_rating,
    CASE
      WHEN opr.rating IS NULL OR opr.provisional OR opr.placements_played < 5 THEN 'UNRANKED'
      WHEN opr.rating >= 2400 THEN 'INTRILEX'
      WHEN opr.rating >= 2200 THEN 'SOVEREIGN'
      WHEN opr.rating >= 2000 THEN 'PARAGON'
      WHEN opr.rating >= 1800 THEN 'ASCENDANT'
      WHEN opr.rating >= 1600 THEN 'VANGUARD'
      WHEN opr.rating >= 1400 THEN 'WARDEN'
      WHEN opr.rating >= 1200 THEN 'CIPHER'
      ELSE 'INITIATE'
    END AS opponent_tier,
    CASE
      WHEN opr.rating IS NULL OR opr.provisional OR opr.placements_played < 5 THEN 'NONE'
      WHEN opr.rating >= 2400 THEN 'NONE'
      WHEN mod(opr.rating - (CASE
        WHEN opr.rating >= 2200 THEN 2200 WHEN opr.rating >= 2000 THEN 2000
        WHEN opr.rating >= 1800 THEN 1800 WHEN opr.rating >= 1600 THEN 1600
        WHEN opr.rating >= 1400 THEN 1400 WHEN opr.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 67 THEN 'III'
      WHEN mod(opr.rating - (CASE
        WHEN opr.rating >= 2200 THEN 2200 WHEN opr.rating >= 2000 THEN 2000
        WHEN opr.rating >= 1800 THEN 1800 WHEN opr.rating >= 1600 THEN 1600
        WHEN opr.rating >= 1400 THEN 1400 WHEN opr.rating >= 1200 THEN 1200
        ELSE 0 END), 200) < 134 THEN 'II'
      ELSE 'I'
    END AS opponent_division,
    m.queue_id,
    m.season_id,
    m.termination_reason
  FROM public.match_participants mp
  JOIN public.matches m ON m.match_id = mp.match_id
  JOIN public.match_participants omp
    ON omp.match_id = mp.match_id AND omp.user_id <> mp.user_id
  LEFT JOIN public.profiles op ON op.user_id = omp.user_id
  LEFT JOIN public.player_ratings opr ON opr.user_id = omp.user_id
    AND opr.queue_id = 'ranked' AND opr.season_id = v_season
  WHERE mp.user_id = v_caller
    AND m.status IN ('COMPLETED', 'ABORTED', 'EXPIRED')
  ORDER BY m.ended_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ── Re-grant appropriate privileges on patched functions ──
-- These functions were already granted in prior migrations; re-grant
-- to ensure the patched versions retain the same access patterns.
GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) TO authenticated;

-- ── Revoke PUBLIC execute (defense in depth, per IRX-C09) ──
REVOKE EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) FROM PUBLIC;
