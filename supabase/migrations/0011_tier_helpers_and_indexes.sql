-- ═══════════════════════════════════════════════════════════════
-- Migration 0011: Tier helper functions + search indexes
--
-- 1. Creates reusable SQL helper functions for tier/division computation,
--    eliminating duplicated CASE statements across 6 RPCs in migrations
--    0009 and 0010. The tier thresholds are defined in ONE place.
--
-- 2. Creates functional indexes on profiles(lower(handle)) and
--    profiles(lower(display_name)) to accelerate leaderboard search
--    and profile lookups (previously full table scans).
--
-- 3. Uses CREATE OR REPLACE FUNCTION to update the existing RPCs to
--    use the helper functions. Signatures are unchanged — this is a
--    pure refactor with identical behavior.
-- ═══════════════════════════════════════════════════════════════

-- ── Tier threshold helper functions ──────────────────────────────
--
-- These encapsulate the canonical tier ladder:
--   INITIATE   [0, 1200)
--   CIPHER     [1200, 1400)
--   WARDEN     [1400, 1600)
--   VANGUARD   [1600, 1800)
--   ASCENDANT  [1800, 2000)
--   PARAGON    [2000, 2200)
--   SOVEREIGN  [2200, 2400)
--   INTRILEX   [2400, ∞)  (apex, no division)
--
-- Division within a 200-point band:
--   [0, 67)   → III
--   [67, 134) → II
--   [134, 200)→ I

CREATE OR REPLACE FUNCTION public.tier_for_rating(p_rating integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_rating >= 2400 THEN 'INTRILEX'
    WHEN p_rating >= 2200 THEN 'SOVEREIGN'
    WHEN p_rating >= 2000 THEN 'PARAGON'
    WHEN p_rating >= 1800 THEN 'ASCENDANT'
    WHEN p_rating >= 1600 THEN 'VANGUARD'
    WHEN p_rating >= 1400 THEN 'WARDEN'
    WHEN p_rating >= 1200 THEN 'CIPHER'
    ELSE 'INITIATE'
  END
$$;

CREATE OR REPLACE FUNCTION public.division_for_rating(p_rating integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_rating >= 2400 THEN NULL
    WHEN mod(p_rating - (
      CASE WHEN p_rating >= 2200 THEN 2200
           WHEN p_rating >= 2000 THEN 2000
           WHEN p_rating >= 1800 THEN 1800
           WHEN p_rating >= 1600 THEN 1600
           WHEN p_rating >= 1400 THEN 1400
           WHEN p_rating >= 1200 THEN 1200
           ELSE 0 END
    ), 200) < 67 THEN 'III'
    WHEN mod(p_rating - (
      CASE WHEN p_rating >= 2200 THEN 2200
           WHEN p_rating >= 2000 THEN 2000
           WHEN p_rating >= 1800 THEN 1800
           WHEN p_rating >= 1600 THEN 1600
           WHEN p_rating >= 1400 THEN 1400
           WHEN p_rating >= 1200 THEN 1200
           ELSE 0 END
    ), 200) < 134 THEN 'II'
    ELSE 'I'
  END
$$;

CREATE OR REPLACE FUNCTION public.is_apex_rating(p_rating integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_rating >= 2400
$$;

-- Grant execute on helper functions to authenticated (needed for inline use in RPCs)
GRANT EXECUTE ON FUNCTION public.tier_for_rating(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.division_for_rating(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_apex_rating(integer) TO authenticated;

-- ── Functional indexes for search ────────────────────────────────
--
-- The leaderboard search RPC uses `lower(p.handle) LIKE lower(v_search)`
-- and `lower(p.display_name) LIKE lower(v_search)`. Without functional
-- indexes on these expressions, every search query triggers a full table
-- scan on profiles. These indexes enable index-backed pattern matching.
--
-- Note: LIKE with a leading wildcard ('%query%') cannot use a plain btree
-- index for the leading wildcard, but the index still helps for:
--   - Exact handle lookups (lower(handle) = lower(input))
--   - Prefix searches in the profile RPC (lower(handle) = lower(input))
--   - Filter pruning when combined with other conditions

CREATE INDEX IF NOT EXISTS idx_profiles_handle_lower
  ON public.profiles (lower(handle));

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower
  ON public.profiles (lower(display_name));

-- ── Replace get_ranked_leaderboard to use helper functions ───────

CREATE OR REPLACE FUNCTION public.get_ranked_leaderboard(
  p_season_id   text DEFAULT NULL,
  p_queue_id    text DEFAULT 'ranked',
  p_tier_filter text DEFAULT NULL,
  p_search      text DEFAULT NULL,
  p_limit       integer DEFAULT 100,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  position        integer,
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
    e.pos::integer AS position,
    e.public_player_id,
    e.display_name,
    e.handle,
    e.avatar_url,
    e.rating,
    e.wins,
    e.losses,
    e.draws,
    e.rated_matches,
    public.tier_for_rating(e.rating) AS tier,
    public.division_for_rating(e.rating) AS division,
    public.is_apex_rating(e.rating) AS is_apex
  FROM eligible e
  WHERE p_tier_filter IS NULL OR p_tier_filter = 'ALL'
     OR public.tier_for_rating(e.rating) = p_tier_filter
  ORDER BY e.pos
  LIMIT LEAST(GREATEST(p_limit, 1), 200)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ── Replace get_player_standing to use helper functions ──────────

CREATE OR REPLACE FUNCTION public.get_player_standing(
  p_season_id text DEFAULT NULL,
  p_queue_id  text DEFAULT 'ranked',
  p_user_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  position        integer,
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
    public.tier_for_rating(e.rating),
    public.division_for_rating(e.rating),
    public.is_apex_rating(e.rating), e.peak_rating, e.placements_played, false
  FROM eligible e
  WHERE e.user_id = v_user_id;
END;
$$;

-- ── Replace get_player_season_history to use helper functions ────

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
    public.tier_for_rating(pr.rating),
    public.division_for_rating(pr.rating),
    pr.peak_rating,
    public.tier_for_rating(pr.peak_rating),
    NULL::text,
    pr.wins, pr.losses, pr.draws, (pr.wins + pr.losses + pr.draws), true
  FROM public.player_ratings pr
  JOIN public.ranked_seasons s ON s.season_id = pr.season_id
  WHERE pr.user_id = v_user_id AND pr.queue_id = p_queue_id
    AND s.status = 'ACTIVE';
END;
$$;

-- ── Replace get_public_profile to use helper functions ───────────

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
  v_priv_ach      text;
  v_priv_mh       text;
  v_is_guest      boolean;
  v_rating        integer;
  v_rd            double precision;
  v_rated_matches integer;
  v_wins          integer;
  v_losses        integer;
  v_draws         integer;
  v_peak          integer;
  v_placements    integer;
  v_provisional   boolean;
  v_position      integer;
  v_ach_count     integer;
  v_total_ach     integer;
  v_ap            integer;
  v_max_ap        integer;
  v_tier          text;
  v_division      text;
  v_peak_tier     text;
  v_peak_div      text;
  v_is_apex       boolean;
  v_showcase      jsonb;
  v_recent        jsonb;
  v_seasons       jsonb;
BEGIN
  -- Resolve user by handle (case-insensitive) or public_player_id
  SELECT p.user_id, p.public_player_id, p.display_name, p.handle, p.avatar_url, p.created_at
    INTO v_user_id, v_public_id, v_display, v_handle, v_avatar, v_joined
    FROM public.profiles p
    LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
    WHERE (lower(p.handle) = lower(p_handle_or_public_id)
           OR p.public_player_id = p_handle_or_public_id)
      AND (m.status IS NULL OR m.status = 'ACTIVE');

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_is_guest := false;

  -- Load customization
  SELECT title_id, profile_frame_id, card_back_id
    INTO v_title_id, v_frame_id, v_card_back_id
    FROM public.profile_customization WHERE user_id = v_user_id;
  IF v_title_id IS NULL THEN v_title_id := 'none'; v_frame_id := 'none'; v_card_back_id := 'default'; END IF;

  -- Load privacy
  SELECT achievements, match_history
    INTO v_priv_ach, v_priv_mh
    FROM public.profile_privacy WHERE user_id = v_user_id;
  IF v_priv_ach IS NULL THEN v_priv_ach := 'PUBLIC'; END IF;
  IF v_priv_mh IS NULL THEN v_priv_mh := 'PUBLIC'; END IF;

  -- Load ranked summary (current season)
  SELECT pr.rating, pr.rating_deviation, pr.rated_matches, pr.wins, pr.losses, pr.draws,
         pr.peak_rating, pr.placements_played, pr.provisional
    INTO v_rating, v_rd, v_rated_matches, v_wins, v_losses, v_draws, v_peak, v_placements, v_provisional
    FROM public.player_ratings pr
    JOIN public.ranked_seasons s ON s.season_id = pr.season_id
    WHERE pr.user_id = v_user_id AND pr.queue_id = 'ranked' AND s.status = 'ACTIVE'
    LIMIT 1;

  -- Compute leaderboard position (only if eligible)
  v_position := NULL;
  IF v_rating IS NOT NULL AND v_provisional = false AND v_placements >= 5 THEN
    SELECT pos INTO v_position FROM (
      SELECT pr.user_id, ROW_NUMBER() OVER (
        ORDER BY pr.rating DESC, pr.rating_deviation ASC, pr.rated_matches DESC,
                 pr.last_rated_at DESC NULLS LAST, p.public_player_id ASC
      ) AS pos
      FROM public.player_ratings pr
      JOIN public.profiles p ON p.user_id = pr.user_id
      LEFT JOIN public.account_moderation m ON m.user_id = pr.user_id
      WHERE pr.queue_id = 'ranked' AND pr.season_id = (
        SELECT season_id FROM public.ranked_seasons WHERE queue_id = 'ranked' AND status = 'ACTIVE' LIMIT 1
      ) AND pr.provisional = false AND pr.placements_played >= 5
        AND (m.status IS NULL OR m.status = 'ACTIVE')
    ) ranked WHERE ranked.user_id = v_user_id;
  END IF;

  -- Tier/division computation (using helper functions)
  v_tier := NULL; v_division := NULL; v_is_apex := false; v_peak_tier := NULL; v_peak_div := NULL;
  IF v_rating IS NOT NULL AND v_provisional = false AND v_placements >= 5 THEN
    v_tier := public.tier_for_rating(v_rating);
    v_division := public.division_for_rating(v_rating);
    v_is_apex := public.is_apex_rating(v_rating);
    IF v_peak IS NOT NULL THEN
      v_peak_tier := public.tier_for_rating(v_peak);
      v_peak_div := public.division_for_rating(v_peak);
    END IF;
  END IF;

  -- Achievement summary (only if public)
  v_ach_count := NULL; v_total_ach := 56; v_ap := NULL; v_max_ap := 1320;
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

  -- Recent matches (only if public)
  v_recent := NULL;
  IF v_priv_mh = 'PUBLIC' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'matchId', mp.match_id,
      'result', mp.result,
      'ratingDelta', mp.rating_delta,
      'timestamp', m.ended_at,
      'seasonId', 'season-1'
    ) ORDER BY m.ended_at DESC), '[]'::jsonb) INTO v_recent
    FROM public.match_participants mp
    JOIN public.matches m ON m.match_id = mp.match_id
    WHERE mp.user_id = v_user_id AND m.status = 'COMPLETED'
    LIMIT 10;
  END IF;

  -- Season history (only if public)
  v_seasons := NULL;
  IF v_priv_mh = 'PUBLIC' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'seasonId', a.season_id, 'name', s.name, 'status', 'ARCHIVED',
      'finalRating', a.final_rating, 'finalPosition', a.final_position,
      'finalTier', a.final_tier, 'finalDivision', a.final_division,
      'peakRating', a.peak_rating, 'peakTier', a.peak_tier, 'peakDivision', a.peak_division,
      'wins', a.wins, 'losses', a.losses, 'draws', a.draws, 'games', a.games,
      'isCurrent', false
    ) ORDER BY a.final_position NULLS LAST), '[]'::jsonb) INTO v_seasons
    FROM public.ranked_season_archive a
    JOIN public.ranked_seasons s ON s.season_id = a.season_id
    WHERE a.user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'identity', jsonb_build_object(
      'publicPlayerId', v_public_id,
      'displayName', v_display,
      'handle', v_handle,
      'avatarUrl', v_avatar,
      'joinedAt', v_joined,
      'accountType', CASE WHEN v_is_guest THEN 'GUEST' ELSE 'PERMANENT' END,
      'titleId', v_title_id,
      'profileFrameId', v_frame_id,
      'cardBackId', v_card_back_id
    ),
    'ranked', CASE WHEN v_rating IS NULL THEN NULL ELSE jsonb_build_object(
      'available', true,
      'isPlacement', (v_provisional OR v_placements < 5),
      'placementsPlayed', LEAST(v_placements, 5),
      'placementsRequired', 5,
      'tier', v_tier,
      'division', v_division,
      'rating', v_rating,
      'leaderboardPosition', v_position,
      'wins', v_wins, 'losses', v_losses, 'draws', v_draws,
      'games', (v_wins + v_losses + v_draws),
      'winRate', CASE WHEN (v_wins + v_losses + v_draws) > 0
        THEN v_wins::double precision / (v_wins + v_losses + v_draws) ELSE NULL END,
      'peakRating', v_peak, 'peakTier', v_peak_tier, 'peakDivision', v_peak_div,
      'isApex', v_is_apex
    ) END,
    'achievements', CASE WHEN v_priv_ach = 'PUBLIC' THEN jsonb_build_object(
      'earnedCount', v_ach_count, 'totalCount', v_total_ach,
      'achievementPoints', v_ap, 'maxAp', v_max_ap
    ) ELSE NULL END,
    'showcase', v_showcase,
    'recentMatches', v_recent,
    'seasonHistory', v_seasons,
    'privacy', jsonb_build_object(
      'achievementsVisible', (v_priv_ach = 'PUBLIC'),
      'matchHistoryVisible', (v_priv_mh = 'PUBLIC')
    )
  );
END;
$$;

-- ── Replace get_self_profile to use helper functions ─────────────

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

  SELECT match_history, achievements, online_status, local_stats
    INTO v_priv_mh, v_priv_ach, v_priv_os, v_priv_ls
    FROM public.profile_privacy WHERE user_id = v_user_id;
  IF v_priv_mh IS NULL THEN v_priv_mh := 'PUBLIC'; v_priv_ach := 'PUBLIC'; v_priv_os := 'PRIVATE'; v_priv_ls := 'PRIVATE'; END IF;

  -- Ranked
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
      WHERE pr.queue_id = 'ranked' AND pr.season_id = (
        SELECT season_id FROM public.ranked_seasons WHERE queue_id = 'ranked' AND status = 'ACTIVE' LIMIT 1
      ) AND pr.provisional = false AND pr.placements_played >= 5
        AND (m.status IS NULL OR m.status = 'ACTIVE')
    ) ranked WHERE ranked.user_id = v_user_id;
    v_tier := public.tier_for_rating(v_rating);
    v_division := public.division_for_rating(v_rating);
    v_is_apex := public.is_apex_rating(v_rating);
    IF v_peak IS NOT NULL THEN
      v_peak_tier := public.tier_for_rating(v_peak);
      v_peak_div := public.division_for_rating(v_peak);
    END IF;
  END IF;

  SELECT count(*) INTO v_ach_count FROM public.account_achievements WHERE user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'slot', slot, 'type', item_type, 'itemId', item_id
  ) ORDER BY slot), '[]'::jsonb) INTO v_showcase
  FROM public.profile_showcase WHERE user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'matchId', mp.match_id, 'result', mp.result,
    'ratingDelta', mp.rating_delta, 'timestamp', m.ended_at, 'seasonId', 'season-1'
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

  -- Online stats
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
    'onlineStats', CASE WHEN v_online_m IS NULL THEN NULL ELSE jsonb_build_object(
      'onlineMatches', v_online_m, 'onlineWins', v_online_w, 'onlineLosses', v_online_l,
      'onlineDraws', v_online_d, 'rankedMatches', v_ranked_m, 'rankedWins', v_ranked_w,
      'rankedLosses', v_ranked_l, 'currentWinStreak', v_cur_streak, 'bestWinStreak', v_best_streak
    ) END,
    'isSelf', true
  );
END;
$$;
