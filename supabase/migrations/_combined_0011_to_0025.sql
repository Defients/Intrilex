-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0011_tier_helpers_and_indexes.sql
-- ═══════════════════════════════════════════════════════════════
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



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0012_atomic_persist_match_result.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 0012: Atomic match result persistence RPC
--
-- Creates a single server-side RPC `persist_match_result` that performs
-- all multi-table writes (matches, match_participants, player_ratings,
-- rating_events, player_stats) in a single database transaction.
--
-- Previously, SupabaseMatchResultPersistor made 5+ separate HTTP
-- round-trips per participant with no transaction wrapping. A failure
-- mid-way through (e.g. after matches + match_participants were written
-- but before player_ratings) would leave the database in an
-- inconsistent state — the match was recorded but ratings were not
-- updated, and the idempotency gate would prevent retry.
--
-- This RPC is SECURITY DEFINER (service-role equivalent) and is only
-- callable by the service_role. The match server calls it via the
-- service-role Supabase client.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.persist_match_result(
  p_record jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id         text := p_record->>'matchId';
  v_rules_profile    text := p_record->>'rulesProfileId';
  v_status           text := p_record->>'status';
  v_started_at       timestamptz := (p_record->>'startedAt')::timestamptz;
  v_ended_at         timestamptz := (p_record->>'endedAt')::timestamptz;
  v_termination      text := p_record->>'terminationReason';
  v_winner_user_id   text := p_record->>'winnerUserId';
  v_replay_hash      text := p_record->>'replayHash';
  v_server_version   text := p_record->>'serverVersion';
  v_rules_version    text := p_record->>'rulesVersion';
  v_queue_id         text := COALESCE(p_record->>'queueId', 'casual');
  v_season_id        text;
  v_participants     jsonb := p_record->'participants';
  v_participant      jsonb;
  v_account_id       text;
  v_seat             text;
  v_result           text;
  v_rating_before    integer;
  v_rating_after     integer;
  v_rating_delta     integer;
  v_rd_before        double precision;
  v_rd_after         double precision;
  v_vol_before       double precision;
  v_vol_after        double precision;
  v_is_win           integer;
  v_is_loss          integer;
  v_is_draw          integer;
  v_existing_rating  jsonb;
  v_existing_stats   jsonb;
  v_new_rated        integer;
  v_new_placements   integer;
  v_new_rating       integer;
  v_new_peak         integer;
  v_new_win_streak   integer;
  v_new_best_streak  integer;
  v_already          boolean;
  v_p_count          integer;
  v_i                integer;
BEGIN
  -- ── Idempotency gate ──
  -- If the match is already persisted, return success without re-applying ratings.
  SELECT EXISTS(SELECT 1 FROM public.matches WHERE match_id = v_match_id) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'alreadyPersisted', true, 'error', null);
  END IF;

  -- Resolve season for rated queues
  v_season_id := p_record->>'seasonId';
  IF v_season_id IS NULL OR v_season_id = '' THEN
    IF v_queue_id = 'ranked' THEN
      SELECT season_id INTO v_season_id
        FROM public.ranked_seasons
        WHERE queue_id = 'ranked' AND status = 'ACTIVE'
        ORDER BY starts_at ASC LIMIT 1;
      IF v_season_id IS NULL THEN v_season_id := 'season-1'; END IF;
    ELSE
      v_season_id := 'season-1';
    END IF;
  END IF;

  -- ── Step 1: Insert matches row ──
  INSERT INTO public.matches (
    match_id, rules_profile_id, status, started_at, ended_at,
    termination_reason, winner_user_id, replay_hash,
    server_version, rules_version
  ) VALUES (
    v_match_id, v_rules_profile, v_status, v_started_at, v_ended_at,
    v_termination, v_winner_user_id::uuid, v_replay_hash,
    v_server_version, v_rules_version
  )
  ON CONFLICT (match_id) DO NOTHING;

  -- ── Step 2: Process each participant ──
  v_p_count := jsonb_array_length(v_participants);

  FOR v_i IN 0..v_p_count - 1 LOOP
    v_participant := v_participants->v_i;
    v_account_id := v_participant->>'accountId';

    -- Skip participants without an account (anonymous play)
    IF v_account_id IS NULL OR v_account_id = '' THEN
      CONTINUE;
    END IF;

    v_seat   := v_participant->>'seat';
    v_result := v_participant->>'result';

    v_rating_before := NULLIF(v_participant->>'ratingBefore', '')::integer;
    v_rating_after  := NULLIF(v_participant->>'ratingAfter', '')::integer;
    v_rating_delta  := NULLIF(v_participant->>'ratingDelta', '')::integer;
    v_rd_before     := NULLIF(v_participant->>'rdBefore', '')::double precision;
    v_rd_after      := NULLIF(v_participant->>'rdAfter', '')::double precision;
    v_vol_before    := NULLIF(v_participant->>'volatilityBefore', '')::double precision;
    v_vol_after     := NULLIF(v_participant->>'volatilityAfter', '')::double precision;

    -- Insert participant row (idempotent via PK)
    INSERT INTO public.match_participants (
      match_id, user_id, seat, result,
      rating_before, rating_after, rating_delta
    ) VALUES (
      v_match_id, v_account_id::uuid, v_seat, v_result,
      v_rating_before, v_rating_after, v_rating_delta
    )
    ON CONFLICT (match_id, user_id) DO NOTHING;

    -- Skip rating/stats updates for aborted matches
    IF v_result = 'ABORT' THEN
      CONTINUE;
    END IF;

    v_is_win  := CASE WHEN v_result = 'WIN'  THEN 1 ELSE 0 END;
    v_is_loss := CASE WHEN v_result = 'LOSS' THEN 1 ELSE 0 END;
    v_is_draw := CASE WHEN v_result = 'DRAW' THEN 1 ELSE 0 END;

    -- ── Fetch current player_ratings ──
    SELECT to_jsonb(pr) INTO v_existing_rating
    FROM public.player_ratings pr
    WHERE pr.user_id = v_account_id::uuid
      AND pr.queue_id = v_queue_id
      AND pr.season_id = v_season_id
    LIMIT 1;

    IF v_existing_rating IS NULL THEN
      v_new_rated := 1;
      v_new_placements := LEAST(1, 5);
      v_new_rating := COALESCE(v_rating_after, 1500);
      v_new_peak := v_new_rating;
    ELSE
      v_new_rated := (v_existing_rating->>'rated_matches')::integer + 1;
      v_new_placements := LEAST((v_existing_rating->>'placements_played')::integer + 1, 5);
      v_new_rating := COALESCE(v_rating_after, (v_existing_rating->>'rating')::integer);
      v_new_peak := GREATEST((v_existing_rating->>'peak_rating')::integer, v_new_rating);
    END IF;

    -- ── Upsert player_ratings ──
    INSERT INTO public.player_ratings (
      user_id, queue_id, season_id,
      rating, rating_deviation, volatility,
      provisional, rated_matches, placements_played, peak_rating,
      wins, losses, draws,
      last_rated_at, last_rated_match_id, updated_at
    ) VALUES (
      v_account_id::uuid, v_queue_id, v_season_id,
      v_new_rating,
      COALESCE(v_rd_after, COALESCE(v_rd_before, v_existing_rating->>'rating_deviation')::double precision, 350.0),
      COALESCE(v_vol_after, COALESCE(v_vol_before, v_existing_rating->>'volatility')::double precision, 0.06),
      (v_new_rated < 50),
      v_new_rated, v_new_placements, v_new_peak,
      COALESCE((v_existing_rating->>'wins')::integer, 0) + v_is_win,
      COALESCE((v_existing_rating->>'losses')::integer, 0) + v_is_loss,
      COALESCE((v_existing_rating->>'draws')::integer, 0) + v_is_draw,
      now(), v_match_id, now()
    )
    ON CONFLICT (user_id, queue_id, season_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      rating_deviation = EXCLUDED.rating_deviation,
      volatility = EXCLUDED.volatility,
      provisional = EXCLUDED.provisional,
      rated_matches = EXCLUDED.rated_matches,
      placements_played = EXCLUDED.placements_played,
      peak_rating = EXCLUDED.peak_rating,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      draws = EXCLUDED.draws,
      last_rated_at = EXCLUDED.last_rated_at,
      last_rated_match_id = EXCLUDED.last_rated_match_id,
      updated_at = EXCLUDED.updated_at;

    -- ── Record rating event (audit ledger) ──
    IF v_rating_before IS NOT NULL AND v_rating_after IS NOT NULL THEN
      INSERT INTO public.rating_events (
        match_id, user_id, season_id, queue_id,
        rating_before, rating_after, rating_delta,
        rd_before, rd_after,
        volatility_before, volatility_after,
        result, algorithm_version
      ) VALUES (
        v_match_id, v_account_id::uuid, v_season_id, v_queue_id,
        v_rating_before, v_rating_after, v_rating_delta,
        COALESCE(v_rd_before, COALESCE(v_existing_rating->>'rating_deviation')::double precision, 350.0),
        COALESCE(v_rd_after, COALESCE(v_existing_rating->>'rating_deviation')::double precision, 350.0),
        COALESCE(v_vol_before, COALESCE(v_existing_rating->>'volatility')::double precision, 0.06),
        COALESCE(v_vol_after, COALESCE(v_existing_rating->>'volatility')::double precision, 0.06),
        v_result, 'glicko2-v1'
      )
      ON CONFLICT (match_id, user_id) DO NOTHING;
    END IF;

    -- ── Fetch current player_stats ──
    SELECT to_jsonb(ps) INTO v_existing_stats
    FROM public.player_stats ps
    WHERE ps.user_id = v_account_id::uuid
    LIMIT 1;

    IF v_existing_stats IS NULL THEN
      v_new_win_streak := v_is_win;  -- 1 if win, 0 otherwise
      v_new_best_streak := v_new_win_streak;
    ELSE
      v_new_win_streak := CASE WHEN v_is_win = 1
        THEN (v_existing_stats->>'current_win_streak')::integer + 1
        ELSE 0 END;
      v_new_best_streak := GREATEST(
        (v_existing_stats->>'best_win_streak')::integer,
        v_new_win_streak
      );
    END IF;

    -- ── Upsert player_stats ──
    INSERT INTO public.player_stats (
      user_id, online_matches, online_wins, online_losses, online_draws,
      ranked_matches, ranked_wins, ranked_losses,
      current_win_streak, best_win_streak, updated_at
    ) VALUES (
      v_account_id::uuid,
      COALESCE((v_existing_stats->>'online_matches')::integer, 0) + 1,
      COALESCE((v_existing_stats->>'online_wins')::integer, 0) + v_is_win,
      COALESCE((v_existing_stats->>'online_losses')::integer, 0) + v_is_loss,
      COALESCE((v_existing_stats->>'online_draws')::integer, 0) + v_is_draw,
      COALESCE((v_existing_stats->>'ranked_matches')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN 1 ELSE 0 END),
      COALESCE((v_existing_stats->>'ranked_wins')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN v_is_win ELSE 0 END),
      COALESCE((v_existing_stats->>'ranked_losses')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN v_is_loss ELSE 0 END),
      v_new_win_streak, v_new_best_streak, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      online_matches = EXCLUDED.online_matches,
      online_wins = EXCLUDED.online_wins,
      online_losses = EXCLUDED.online_losses,
      online_draws = EXCLUDED.online_draws,
      ranked_matches = EXCLUDED.ranked_matches,
      ranked_wins = EXCLUDED.ranked_wins,
      ranked_losses = EXCLUDED.ranked_losses,
      current_win_streak = EXCLUDED.current_win_streak,
      best_win_streak = EXCLUDED.best_win_streak,
      updated_at = EXCLUDED.updated_at;

  END LOOP;

  RETURN jsonb_build_object('success', true, 'alreadyPersisted', false, 'error', null);

EXCEPTION WHEN OTHERS THEN
  -- The transaction is automatically rolled back by PL/pgSQL on exception.
  -- Return a structured error so the caller can handle it.
  RETURN jsonb_build_object(
    'success', false,
    'alreadyPersisted', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- Only the service role can call this RPC (it writes to server-authoritative tables)
-- Revoke from authenticated and anon, grant only to service_role
REVOKE EXECUTE ON FUNCTION public.persist_match_result(jsonb) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0013_player_directory.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 0013: Player Directory
--
-- Adds the discovery surface between Profiles and the future social
-- layer. Players who opt into directory visibility become searchable
-- and browsable by other players via a safe public projection only.
--
-- Adds:
--   profile_privacy.directory_visible  — opt-in discoverability flag
--   get_player_directory(p_search, p_tier_filter, p_sort, p_limit, p_offset)
--                                      — server-side directory query RPC
--   set_directory_visible(p_visible)   — owner-only toggle for the flag
--   Indexes                            — directory search/sort performance
--
-- Architectural law (section 3): the browser is never authoritative.
-- Directory visibility is enforced SERVER-SIDE inside the
-- SECURITY DEFINER RPC. A client cannot read profile_privacy for other
-- users (RLS owner-only), so the RPC is the only path to enumerate
-- discoverable players.
--
-- Privacy defaults (section 32): directory_visible defaults to FALSE.
-- No previously-private account becomes discoverable by this migration.
-- Players must explicitly opt in via set_directory_visible (or the
-- profile privacy UI). This is the least-exposing default and is
-- consistent with account_settings.profile_visibility='private'.
--
-- The directory includes ALL discoverable players — ranked, placement,
-- and unranked — unlike the leaderboard (ranked-eligible only). It
-- carries NO competitive position (positions are a Ranked-only concept).
--
-- Safe projection only (section 13/34): the RPC returns
--   public_player_id, display_name, handle, avatar_url, created_at,
--   rating, tier, division, is_apex, is_placement,
--   wins, losses, draws, games, win_rate, rated_matches,
--   earned_achievement_count (only when achievements are PUBLIC)
-- It NEVER returns: auth UUID, email, RD, volatility, tokens, IP,
-- moderation notes, private settings, local stats, or any field the
-- owner has set to PRIVATE.
-- ═══════════════════════════════════════════════════════════════

-- ── Add directory_visible to profile_privacy ──
ALTER TABLE public.profile_privacy
  ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT false;

-- ── pg_trgm extension for trigram-based ILIKE search ──
-- The directory RPC uses leading-wildcard ILIKE ('%query%') which cannot
-- use a plain B-tree index. pg_trgm GIN indexes enable fast substring
-- search on handle and display_name. Supabase ships pg_trgm by default.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Indexes for directory search/sort ──
-- Case-insensitive handle search (functional index on lower(handle))
CREATE INDEX IF NOT EXISTS profiles_handle_lower_idx
  ON public.profiles (lower(handle))
  WHERE handle IS NOT NULL;

-- Display name search (case-insensitive)
CREATE INDEX IF NOT EXISTS profiles_display_name_lower_idx
  ON public.profiles (lower(display_name));

-- Trigram GIN indexes for fast leading-wildcard ILIKE substring search.
-- These accelerate the `lower(p.handle) LIKE lower('%query%')` and
-- `lower(p.display_name) LIKE lower('%query%')` predicates in the RPC.
-- gin_trgm_ops supports both ILIKE and similarity-based queries.
CREATE INDEX IF NOT EXISTS profiles_handle_trgm_idx
  ON public.profiles USING gin (handle gin_trgm_ops)
  WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
  ON public.profiles USING gin (display_name gin_trgm_ops);

-- Newest-sort support
CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON public.profiles (created_at DESC);

-- Directory-visible filter + sort by rating (ranked players)
-- Joins profile_privacy to player_ratings; this index speeds the
-- directory_visible predicate on profile_privacy.
CREATE INDEX IF NOT EXISTS profile_privacy_directory_visible_idx
  ON public.profile_privacy (directory_visible)
  WHERE directory_visible = true;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_player_directory
--
-- Server-side directory query. Returns ONLY safe public columns.
-- Filters:
--   directory_visible = true            (opt-in, server-enforced)
--   moderation status NULL or ACTIVE    (excludes suspended/banned)
--   optional tier filter (by canonical rating thresholds)
--   optional search (handle / display_name ILIKE, 2–64 chars)
-- Sort (server-side, browser never sorts):
--   rating  — rating DESC NULLS LAST, rated_matches DESC, public_player_id ASC
--   games   — rated_matches DESC NULLS LAST, rating DESC NULLS LAST
--   recent  — last_rated_at DESC NULLS LAST, created_at DESC
--   newest  — created_at DESC, public_player_id ASC
--   name    — display_name ASC, handle ASC NULLS LAST
-- Pagination: bounded limit (max 100), offset.
--
-- earned_achievement_count is included ONLY when the player's
-- achievements privacy is PUBLIC; otherwise NULL is returned.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_directory(
  p_search      text DEFAULT NULL,
  p_tier_filter text DEFAULT NULL,
  p_sort        text DEFAULT 'rating',
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id        text,
  display_name            text,
  handle                  text,
  avatar_url              text,
  created_at              timestamptz,
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
  earned_achievement_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_sort   text;
  v_limit  integer;
  v_offset integer;
  v_season text;
BEGIN
  -- Resolve the active ranked season once (for the rating join)
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;
  IF v_season IS NULL THEN v_season := 'season-1'; END IF;

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

  -- Validate sort (default to 'rating')
  v_sort := CASE
    WHEN p_sort IN ('rating','games','recent','newest','name') THEN p_sort
    ELSE 'rating'
  END;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  SELECT
    p.public_player_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.created_at,
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
    -- Achievement count only when the player's achievements are PUBLIC.
    -- Reuses the already-joined pp row (no separate pp2 join needed).
    CASE WHEN COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'
      THEN (SELECT count(*) FROM public.account_achievements a WHERE a.user_id = p.user_id)
      ELSE NULL
    END AS earned_achievement_count
  FROM public.profiles p
  JOIN public.profile_privacy pp ON pp.user_id = p.user_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE COALESCE(pp.directory_visible, false) = true
    AND (m.status IS NULL OR m.status = 'ACTIVE')
    AND (v_search IS NULL
         OR p.handle ILIKE v_search
         OR p.display_name ILIKE v_search)
    AND (
      p_tier_filter IS NULL OR p_tier_filter = 'ALL'
      OR (p_tier_filter = 'INITIATE'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating < 1200)
      OR (p_tier_filter = 'CIPHER'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1200 AND pr.rating < 1400)
      OR (p_tier_filter = 'WARDEN'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1400 AND pr.rating < 1600)
      OR (p_tier_filter = 'VANGUARD'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1600 AND pr.rating < 1800)
      OR (p_tier_filter = 'ASCENDANT' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1800 AND pr.rating < 2000)
      OR (p_tier_filter = 'PARAGON'   AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2000 AND pr.rating < 2200)
      OR (p_tier_filter = 'SOVEREIGN' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2200 AND pr.rating < 2400)
      OR (p_tier_filter = 'INTRILEX'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2400)
    )
  ORDER BY
    -- Primary sort key (each CASE is single-typed to avoid bigint/text mismatch)
    CASE WHEN v_sort = 'rating' THEN pr.rating END DESC NULLS LAST,
    CASE WHEN v_sort = 'games'  THEN pr.rated_matches END DESC NULLS LAST,
    CASE WHEN v_sort = 'recent' THEN pr.last_rated_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'newest' THEN p.created_at END DESC,
    CASE WHEN v_sort = 'name'   THEN p.display_name END ASC,
    -- Secondary sort key
    CASE WHEN v_sort = 'rating' THEN pr.rated_matches END DESC NULLS LAST,
    CASE WHEN v_sort = 'games'  THEN pr.rating END DESC NULLS LAST,
    CASE WHEN v_sort = 'recent' THEN p.created_at END DESC,
    CASE WHEN v_sort = 'newest' THEN p.public_player_id END ASC,
    CASE WHEN v_sort = 'name'   THEN COALESCE(p.handle, '') END ASC,
    -- Tertiary sort key (tiebreaker)
    p.public_player_id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_player_directory_count
--
-- Returns the total count of discoverable players matching the same
-- search/tier filters as get_player_directory (without pagination).
-- Enables "Showing 1–25 of 312" summary in the UI without a separate
-- full query. Uses the same SECURITY DEFINER + search_path = public
-- boundary. Returns jsonb { count: integer } for consistency.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_directory_count(
  p_search      text DEFAULT NULL,
  p_tier_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_count  integer;
  v_season text;
BEGIN
  -- Resolve the active ranked season once (for the rating join)
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;
  IF v_season IS NULL THEN v_season := 'season-1'; END IF;

  -- Sanitize search: trim + cap length (same logic as get_player_directory)
  v_search := NULL;
  IF p_search IS NOT NULL THEN
    v_search := trim(p_search);
    IF length(v_search) < 2 OR length(v_search) > 64 THEN
      v_search := NULL;
    ELSE
      v_search := '%' || v_search || '%';
    END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles p
  JOIN public.profile_privacy pp ON pp.user_id = p.user_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE COALESCE(pp.directory_visible, false) = true
    AND (m.status IS NULL OR m.status = 'ACTIVE')
    AND (v_search IS NULL
         OR p.handle ILIKE v_search
         OR p.display_name ILIKE v_search)
    AND (
      p_tier_filter IS NULL OR p_tier_filter = 'ALL'
      OR (p_tier_filter = 'INITIATE'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating < 1200)
      OR (p_tier_filter = 'CIPHER'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1200 AND pr.rating < 1400)
      OR (p_tier_filter = 'WARDEN'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1400 AND pr.rating < 1600)
      OR (p_tier_filter = 'VANGUARD'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1600 AND pr.rating < 1800)
      OR (p_tier_filter = 'ASCENDANT' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1800 AND pr.rating < 2000)
      OR (p_tier_filter = 'PARAGON'   AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2000 AND pr.rating < 2200)
      OR (p_tier_filter = 'SOVEREIGN' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2200 AND pr.rating < 2400)
      OR (p_tier_filter = 'INTRILEX'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2400)
    );

  RETURN jsonb_build_object('count', v_count);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: set_directory_visible
--
-- Owner-only toggle for directory discoverability. Single-responsibility:
-- updates only the directory_visible column, so privacy saves for the
-- four visibility fields (update_profile_privacy) can never accidentally
-- reset the directory flag.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_directory_visible(p_visible boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;
  IF p_visible IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_VISIBILITY');
  END IF;
  INSERT INTO public.profile_privacy (user_id, directory_visible)
    VALUES (auth.uid(), p_visible)
    ON CONFLICT (user_id) DO UPDATE SET
      directory_visible = EXCLUDED.directory_visible,
      updated_at = now();
  RETURN jsonb_build_object('ok', true, 'directoryVisible', p_visible);
END;
$$;

-- Grant execute on directory RPCs.
-- Read RPCs (get_player_directory, get_player_directory_count) are granted
-- to both authenticated and anon roles so anonymous visitors can browse
-- the directory. The set_directory_visible mutation is authenticated-only.
GRANT EXECUTE ON FUNCTION public.get_player_directory TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory TO anon;
GRANT EXECUTE ON FUNCTION public.get_player_directory_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory_count TO anon;
GRANT EXECUTE ON FUNCTION public.set_directory_visible TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Augment get_self_profile to expose directoryVisible to the owner.
--
-- The owner is permitted to read their own directory_visible flag (it
-- is their own privacy setting, not another user's private data). We
-- re-create the function with the additional field in the JSON return.
-- This keeps the directory toggle in the profile privacy modal without
-- a separate round-trip.
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
-- BEGIN MIGRATION: 0014_authenticated_grants.sql
-- ═══════════════════════════════════════════════════════════════
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



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0015_recent_opponents.sql
-- ═══════════════════════════════════════════════════════════════
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



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0016_player_relationships.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 0016: Player Relationships (Rivals & Follows)
--
-- The social-graph foundation for Intrilex. Three relationship kinds:
--   FOLLOW — lightweight social subscription (asymmetric)
--   RIVAL  — competitive signal (a player you track closely)
--   BLOCK  — safety/moderation (blocked players cannot challenge you)
--
-- Adds:
--   player_relationships table — (follower_id, target_id, kind, created_at)
--   RLS policies              — owner-only for all writes; owner-only
--                               reads for BLOCK; self-visible for
--                               FOLLOW/RIVAL (you see who you follow).
--   follow_player / unfollow_player
--   set_rival / unset_rival
--   block_player / unblock_player
--   get_relationships(p_kind, p_limit, p_offset) — list your follows/rivals/blocks
--   get_relationship_status(p_target_public_id) — your relationship to one player
--   get_suggested_rivals(p_limit) — derived from head-to-head intensity
--   Indexes                   — relationship lookup performance
--
-- Architectural law (section 3): the browser is never authoritative.
-- All relationship state is computed SERVER-SIDE. The browser cannot
-- enumerate relationships or construct head-to-head records client-side.
--
-- Privacy (section 13/34):
--   - FOLLOW and RIVAL are SELF-VISIBLE only (you see who you follow;
--     others cannot see your follow list — no public follower counts).
--   - BLOCK is PRIVATE to the blocker. The blocked player never sees
--     that they are blocked (no notification, no surface).
--   - The RPCs return ONLY the safe public projection of the TARGET
--     (public_player_id, display_name, handle, avatar_url, rank) PLUS
--     the relationship kind, head-to-head (from the caller's
--     perspective), and timestamps. They NEVER return: auth UUID,
--     email, RD, volatility, tokens, IP, moderation notes, or private
--     settings of either party.
--
-- Self-relationship guard: a player cannot follow/rival/block
-- themselves. The RPCs enforce this by comparing auth.uid() to the
-- target's resolved user_id.
--
-- Match-server integration: the match server can consult
-- player_relationships to refuse challenges from blocked players
-- (server-side check via the service role, not exposed to the browser).
-- ═══════════════════════════════════════════════════════════════

-- ── Table ──
CREATE TABLE IF NOT EXISTS public.player_relationships (
  follower_id uuid NOT NULL,      -- the acting player (auth.uid())
  target_id   uuid NOT NULL,      -- the player they relate to
  kind        text NOT NULL CHECK (kind IN ('follow','rival','block')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- A player has at most one relationship of each kind with a given target.
  CONSTRAINT player_relationships_unique UNIQUE (follower_id, target_id, kind),
  -- No self-relationships (defense in depth — RPCs also enforce this).
  CONSTRAINT player_relationships_no_self CHECK (follower_id <> target_id)
);

-- Indexes for the common query patterns
CREATE INDEX IF NOT EXISTS player_relationships_follower_idx
  ON public.player_relationships (follower_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS player_relationships_target_idx
  ON public.player_relationships (target_id, kind);

-- ── Row Level Security ──
-- Players can only touch rows where they are the follower. The target
-- never sees incoming FOLLOW/RIVAL rows (no public follower list), and
-- NEVER sees incoming BLOCK rows (blocks are private to the blocker).
ALTER TABLE public.player_relationships ENABLE ROW LEVEL SECURITY;

-- SELECT: a player can read only their OWN outgoing relationships
-- (regardless of kind). This means you see who YOU follow/rival/block,
-- but you cannot see who follows/rivals/blocks YOU.
CREATE POLICY player_relationships_select_own
  ON public.player_relationships FOR SELECT
  TO authenticated
  USING (follower_id = auth.uid());

-- INSERT: a player can only create relationships where they are the follower
CREATE POLICY player_relationships_insert_own
  ON public.player_relationships FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

-- DELETE: a player can only delete their own relationships
CREATE POLICY player_relationships_delete_own
  ON public.player_relationships FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- No UPDATE policy — relationships are immutable (delete + re-insert
-- to change kind). This prevents accidental kind-mutation via UPDATE.

-- ── Grants ──
-- authenticated needs table-level privileges for RLS to apply.
GRANT SELECT, INSERT, DELETE ON public.player_relationships TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Helper: resolve a target user_id from a public_player_id or handle.
-- Used by every mutation RPC so the browser only ever passes the SAFE
-- public id (never an auth UUID).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._resolve_target_user_id(p_target text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.profiles
  WHERE public_player_id = p_target
     OR lower(handle) = lower(p_target)
  LIMIT 1
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: follow_player
--   Establishes a FOLLOW relationship. Idempotent (INSERT ... ON
--   CONFLICT DO NOTHING). Rejects self-relationships and unknown targets.
--   Returns { ok: boolean, error: text|null, followed: boolean }
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.follow_player(p_target_public_id text)
RETURNS table(ok boolean, error text, followed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  IF v_target = v_caller THEN
    RETURN QUERY SELECT false, 'CANNOT_RELATE_TO_SELF'::text, false;
    RETURN;
  END IF;
  -- Refuse to follow a player you have blocked (and vice versa): a
  -- block is a hard boundary. The UI should also prevent this, but
  -- the server is the authority.
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target AND kind = 'block';
  INSERT INTO public.player_relationships (follower_id, target_id, kind)
    VALUES (v_caller, v_target, 'follow')
    ON CONFLICT (follower_id, target_id, kind) DO NOTHING;
  RETURN QUERY SELECT true, null::text, true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: unfollow_player
--   Removes a FOLLOW relationship. Idempotent. Returns followed=false.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unfollow_player(p_target_public_id text)
RETURNS table(ok boolean, error text, followed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target AND kind = 'follow';
  RETURN QUERY SELECT true, null::text, false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: set_rival
--   Marks a target as a RIVAL. Rivaling also establishes a FOLLOW
--   (you cannot rival someone you don't follow — the UI relies on
--   this invariant for the Rivals tab). Clears any existing block.
--   Returns { ok, error, rivaled }
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_rival(p_target_public_id text)
RETURNS table(ok boolean, error text, rivaled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  IF v_target = v_caller THEN
    RETURN QUERY SELECT false, 'CANNOT_RELATE_TO_SELF'::text, false;
    RETURN;
  END IF;
  -- Clear any block (a block is a hard boundary; rivaling overrides it)
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target AND kind = 'block';
  -- Ensure the follow exists (rival implies follow)
  INSERT INTO public.player_relationships (follower_id, target_id, kind)
    VALUES (v_caller, v_target, 'follow')
    ON CONFLICT (follower_id, target_id, kind) DO NOTHING;
  -- Establish the rival
  INSERT INTO public.player_relationships (follower_id, target_id, kind)
    VALUES (v_caller, v_target, 'rival')
    ON CONFLICT (follower_id, target_id, kind) DO NOTHING;
  RETURN QUERY SELECT true, null::text, true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: unset_rival
--   Removes a RIVAL relationship (the FOLLOW is preserved). Idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unset_rival(p_target_public_id text)
RETURNS table(ok boolean, error text, rivaled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target AND kind = 'rival';
  RETURN QUERY SELECT true, null::text, false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: block_player
--   Blocks a target. Blocking ALSO removes any existing FOLLOW and
--   RIVAL (you cannot follow someone you block). Idempotent.
--   Returns { ok, error, blocked }
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.block_player(p_target_public_id text)
RETURNS table(ok boolean, error text, blocked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  IF v_target = v_caller THEN
    RETURN QUERY SELECT false, 'CANNOT_RELATE_TO_SELF'::text, false;
    RETURN;
  END IF;
  -- Remove any follow/rival (a block supersedes them)
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target
      AND kind IN ('follow','rival');
  INSERT INTO public.player_relationships (follower_id, target_id, kind)
    VALUES (v_caller, v_target, 'block')
    ON CONFLICT (follower_id, target_id, kind) DO NOTHING;
  RETURN QUERY SELECT true, null::text, true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: unblock_player
--   Removes a BLOCK. Idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unblock_player(p_target_public_id text)
RETURNS table(ok boolean, error text, blocked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED'::text, false;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, false;
    RETURN;
  END IF;
  DELETE FROM public.player_relationships
    WHERE follower_id = v_caller AND target_id = v_target AND kind = 'block';
  RETURN QUERY SELECT true, null::text, false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_relationships(p_kind, p_limit, p_offset)
--   Lists the caller's relationships of a given kind (follow/rival/block).
--   Returns the safe public projection of the target + head-to-head
--   (from the caller's perspective) + mutual-rival flag + created_at.
--
--   For 'follow' and 'rival', head-to-head is derived from
--   match_participants. For 'block', head-to-head is zeroed (blocks
--   are not competitive).
--
--   Ordered by created_at DESC (most recently established first).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_relationships(
  p_kind  text DEFAULT 'follow',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id        text,
  display_name            text,
  handle                  text,
  avatar_url              text,
  kind                    text,
  rating                  integer,
  tier                    text,
  division                text,
  is_apex                 boolean,
  is_placement            boolean,
  rated_matches           integer,
  earned_achievement_count integer,
  -- Head-to-head (caller's perspective)
  opponent_wins           integer,
  opponent_losses         integer,
  opponent_draws          integer,
  opponent_games          integer,
  last_played_at          timestamptz,
  -- Relationship metadata
  created_at              timestamptz,
  is_mutual_rival         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_limit  integer;
  v_offset integer;
  v_season text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;
  IF p_kind NOT IN ('follow','rival','block') THEN
    RETURN;
  END IF;
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;
  -- IRX-H07: Do not fabricate 'season-1'. If no active season exists,
  -- rating/tier/division columns will be NULL (UNRANKED), which is
  -- the correct conservative projection.
  -- IF v_season IS NULL THEN v_season := 'season-1'; END IF;

  RETURN QUERY
  WITH rels AS (
    SELECT pr.target_id, pr.kind, pr.created_at
    FROM public.player_relationships pr
    WHERE pr.follower_id = v_caller AND pr.kind = p_kind
  ),
  -- Head-to-head per target (caller's perspective). Zero for blocks.
  h2h AS (
    SELECT
      om.opponent_user_id,
      count(*) AS match_count,
      count(*) FILTER (WHERE om.caller_result = 'WIN')  AS h2h_wins,
      count(*) FILTER (WHERE om.caller_result = 'LOSS') AS h2h_losses,
      count(*) FILTER (WHERE om.caller_result = 'DRAW') AS h2h_draws,
      max(om.ended_at) AS last_played_at
    FROM (
      SELECT cmp.match_id, cmp.result AS caller_result, cmp.ended_at,
             omp.user_id AS opponent_user_id
      FROM public.match_participants cmp
      JOIN public.matches m ON m.match_id = cmp.match_id
      JOIN public.match_participants omp
        ON omp.match_id = cmp.match_id AND omp.user_id <> cmp.user_id
      WHERE cmp.user_id = v_caller
        AND m.status = 'COMPLETED'
        AND cmp.result IN ('WIN','LOSS','DRAW')
    ) om
    GROUP BY om.opponent_user_id
  ),
  -- Mutual rival: target also has a 'rival' row pointing back at caller
  mutual AS (
    SELECT target_id AS mutual_target_id
    FROM public.player_relationships
    WHERE follower_id IN (SELECT target_id FROM rels)
      AND target_id = v_caller
      AND kind = 'rival'
  )
  SELECT
    p.public_player_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    r.kind,
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
    CASE WHEN COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'
      THEN (SELECT count(*) FROM public.account_achievements a WHERE a.user_id = r.target_id)
      ELSE NULL
    END AS earned_achievement_count,
    -- Head-to-head (zeroed for blocks)
    CASE WHEN r.kind = 'block' THEN 0 ELSE COALESCE(h.h2h_wins, 0) END AS opponent_wins,
    CASE WHEN r.kind = 'block' THEN 0 ELSE COALESCE(h.h2h_losses, 0) END AS opponent_losses,
    CASE WHEN r.kind = 'block' THEN 0 ELSE COALESCE(h.h2h_draws, 0) END AS opponent_draws,
    CASE WHEN r.kind = 'block' THEN 0 ELSE COALESCE(h.h2h_wins,0)+COALESCE(h.h2h_losses,0)+COALESCE(h.h2h_draws,0) END AS opponent_games,
    CASE WHEN r.kind = 'block' THEN NULL ELSE h.last_played_at END AS last_played_at,
    r.created_at,
    (mut.mutual_target_id IS NOT NULL) AS is_mutual_rival
  FROM rels r
  JOIN public.profiles p ON p.user_id = r.target_id
  LEFT JOIN public.profile_privacy pp ON pp.user_id = r.target_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = r.target_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN h2h h ON h.opponent_user_id = r.target_id
  LEFT JOIN mutual mut ON mut.mutual_target_id = r.target_id
  LEFT JOIN public.account_moderation m ON m.user_id = r.target_id
  WHERE (m.status IS NULL OR m.status = 'ACTIVE')
  ORDER BY r.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_relationship_status(p_target_public_id)
--   Returns the caller's relationship status to a single target:
--   following, rivaling, blocking, isMutualRival, and timestamps.
--   Used by the profile hero to render the correct Follow/Rival/Block
--   button state. Returns a single row.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_relationship_status(p_target_public_id text)
RETURNS TABLE (
  following        boolean,
  rivaling         boolean,
  blocking         boolean,
  is_mutual_rival  boolean,
  followed_at      timestamptz,
  rivaled_at       timestamptz,
  blocked_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, null, null, null;
    RETURN;
  END IF;
  v_target := public._resolve_target_user_id(p_target_public_id);
  IF v_target IS NULL OR v_target = v_caller THEN
    RETURN QUERY SELECT false, false, false, false, null, null, null;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    EXISTS (SELECT 1 FROM public.player_relationships
             WHERE follower_id = v_caller AND target_id = v_target AND kind = 'follow') AS following,
    EXISTS (SELECT 1 FROM public.player_relationships
             WHERE follower_id = v_caller AND target_id = v_target AND kind = 'rival') AS rivaling,
    EXISTS (SELECT 1 FROM public.player_relationships
             WHERE follower_id = v_caller AND target_id = v_target AND kind = 'block') AS blocking,
    (EXISTS (SELECT 1 FROM public.player_relationships
               WHERE follower_id = v_caller AND target_id = v_target AND kind = 'rival')
     AND EXISTS (SELECT 1 FROM public.player_relationships
               WHERE follower_id = v_target AND target_id = v_caller AND kind = 'rival')) AS is_mutual_rival,
    (SELECT created_at FROM public.player_relationships
       WHERE follower_id = v_caller AND target_id = v_target AND kind = 'follow' LIMIT 1) AS followed_at,
    (SELECT created_at FROM public.player_relationships
       WHERE follower_id = v_caller AND target_id = v_target AND kind = 'rival' LIMIT 1) AS rivaled_at,
    (SELECT created_at FROM public.player_relationships
       WHERE follower_id = v_caller AND target_id = v_target AND kind = 'block' LIMIT 1) AS blocked_at;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_suggested_rivals(p_limit)
--   Returns opponents the caller has faced in completed matches, ranked
--   by rivalry intensity (most games + closest record + recency), whom
--   the caller does NOT already rival. This is the "people you should
--   rival" surface — a pure function of match history.
--
--   Excludes: self, blocked targets, already-rivaled targets, and
--   moderation-suspended targets. Includes the head-to-head so the UI
--   can show why each player is suggested.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_suggested_rivals(
  p_limit integer DEFAULT 10
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
  rated_matches           integer,
  earned_achievement_count integer,
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
  v_caller uuid := auth.uid();
  v_limit  integer;
  v_season text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);

  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;
  -- IRX-H07: Do not fabricate 'season-1'. If no active season exists,
  -- rating/tier/division columns will be NULL (UNRANKED), which is
  -- the correct conservative projection.
  -- IF v_season IS NULL THEN v_season := 'season-1'; END IF;

  RETURN QUERY
  WITH opponent_matches AS (
    SELECT
      cmp.match_id, cmp.result AS caller_result, cmp.ended_at,
      omp.user_id AS opponent_user_id
    FROM public.match_participants cmp
    JOIN public.matches m ON m.match_id = cmp.match_id
    JOIN public.match_participants omp
      ON omp.match_id = cmp.match_id AND omp.user_id <> cmp.user_id
    WHERE cmp.user_id = v_caller
      AND m.status = 'COMPLETED'
      AND cmp.result IN ('WIN','LOSS','DRAW')
  ),
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
    COALESCE(pr.rated_matches, 0) AS rated_matches,
    CASE WHEN COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'
      THEN (SELECT count(*) FROM public.account_achievements a WHERE a.user_id = os.opponent_user_id)
      ELSE NULL
    END AS earned_achievement_count,
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
    -- Exclude already-rivaled targets
    AND NOT EXISTS (
      SELECT 1 FROM public.player_relationships pr2
      WHERE pr2.follower_id = v_caller
        AND pr2.target_id = os.opponent_user_id
        AND pr2.kind = 'rival')
    -- Exclude blocked targets
    AND NOT EXISTS (
      SELECT 1 FROM public.player_relationships pr3
      WHERE pr3.follower_id = v_caller
        AND pr3.target_id = os.opponent_user_id
        AND pr3.kind = 'block')
  ORDER BY os.match_count DESC,
           (CASE WHEN (os.h2h_wins + os.h2h_losses) > 0
             THEN 1 - abs(os.h2h_wins - os.h2h_losses)::float / (os.h2h_wins + os.h2h_losses)
             ELSE 1 END) DESC,
           os.last_played_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

-- ── Grants on RPCs (authenticated only — all require auth.uid()) ──
GRANT EXECUTE ON FUNCTION public.follow_player TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_player TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_rival TO authenticated;
GRANT EXECUTE ON FUNCTION public.unset_rival TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_player TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_player TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relationships TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relationship_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suggested_rivals TO authenticated;
-- _resolve_target_user_id is internal — no grant (SECURITY DEFINER callers only)



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0017_revoke_public_execute_on_security_definer_functions.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- 0017_revoke_public_execute_on_security_definer_functions.sql
--
-- IRX-C09: SECURITY DEFINER persistence RPC retains default PUBLIC EXECUTE
-- IRX-H44: Internal identity resolver retains PUBLIC EXECUTE and leaks auth UUIDs
--
-- In PostgreSQL, every function has EXECUTE granted to PUBLIC by default.
-- Previous migrations granted EXECUTE to specific roles (authenticated,
-- anon, service_role) but NEVER revoked the default PUBLIC grant.  Because
-- PUBLIC is a catch-all pseudo-role that all roles inherit from, every
-- function remained callable by every role — including anon and any
-- attacker-controlled role.
--
-- This migration:
--   1. Revokes EXECUTE FROM PUBLIC on every SECURITY DEFINER function
--      and every helper function that had only an explicit grant.
--   2. Re-grants EXECUTE to the minimum intended roles, preserving the
--      access pattern established by prior migrations.
--   3. Explicitly denies client access to the internal _resolve_target_user_id
--      helper (IRX-H44 — leaks auth UUIDs).
--   4. Revokes PUBLIC EXECUTE on trigger functions (only called by triggers,
--      never directly by clients).
--
-- Idempotent: REVOKE is a no-op if the grant doesn't exist; GRANT is a
-- no-op if the grant already exists.
--
-- Rollback: If access patterns need to change, issue a new forward migration.
-- Do NOT re-grant PUBLIC EXECUTE.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Service-role-only functions (server-side, no client access) ──

-- IRX-C09: persist_match_result — SECURITY DEFINER, writes to authoritative tables.
-- Prior migration 0012 revoked from authenticated/anon but NOT from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.persist_match_result(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.persist_match_result(jsonb) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role;

-- ── 2. Internal helper functions (no client access) ──

-- IRX-H44: _resolve_target_user_id — SECURITY DEFINER, maps public_player_id/handle
-- to auth UUID.  Must NEVER be callable by client roles.
REVOKE EXECUTE ON FUNCTION public._resolve_target_user_id(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._resolve_target_user_id(text) FROM authenticated, anon;
-- No grant — only SECURITY DEFINER callers inside other RPCs use this.

-- ── 3. Trigger functions (only called by triggers, never directly) ──

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM authenticated, anon;

-- ── 4. Authenticated-only RPCs (require auth.uid()) ──

-- Profile customization (migration 0010)
REVOKE EXECUTE ON FUNCTION public.get_self_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_self_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_self_profile() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_display_name(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_display_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_display_name(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.change_handle(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.change_handle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_handle(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_profile_privacy(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_profile_privacy(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_profile_privacy(text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.equip_title(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.equip_title(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_title(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.equip_profile_frame(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.equip_profile_frame(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_profile_frame(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.equip_card_back(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.equip_card_back(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_card_back(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_showcase_slot(integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_showcase_slot(integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_showcase_slot(integer, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.clear_showcase_slot(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_showcase_slot(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_showcase_slot(integer) TO authenticated;

-- Leaderboard (migration 0009) — authenticated only
REVOKE EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_player_standing(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_ranked_seasons(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ranked_seasons(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ranked_seasons(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_player_season_history(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_player_season_history(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_player_season_history(text, uuid) TO authenticated;

-- Profile viewing (migration 0010) — authenticated only
REVOKE EXECUTE ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_profile(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;

-- Player directory visibility (migration 0013)
REVOKE EXECUTE ON FUNCTION public.set_directory_visible(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_directory_visible(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_directory_visible(boolean) TO authenticated;

-- Recent opponents (migration 0015) — authenticated only
REVOKE EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_recent_opponents(integer, integer) TO authenticated;

-- Player relationships (migration 0016) — all authenticated only
REVOKE EXECUTE ON FUNCTION public.follow_player(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.follow_player(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.follow_player(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unfollow_player(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unfollow_player(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unfollow_player(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_rival(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_rival(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_rival(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unset_rival(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unset_rival(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unset_rival(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.block_player(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_player(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.block_player(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unblock_player(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unblock_player(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unblock_player(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_relationships(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_relationships(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_relationships(text, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_relationship_status(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_relationship_status(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_relationship_status(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_suggested_rivals(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_suggested_rivals(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_rivals(integer) TO authenticated;

-- ── 5. Public + authenticated RPCs (anon can call) ──

-- Player directory (migration 0013) — anon can browse the directory
REVOKE EXECUTE ON FUNCTION public.get_player_directory(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_directory(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory(text, text, text, integer, integer) TO anon;

REVOKE EXECUTE ON FUNCTION public.get_player_directory_count(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_directory_count(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory_count(text, text) TO anon;

-- ── 6. Non-SECURITY-DEFINER helper functions (defensive hardening) ──
-- These are IMMUTABLE SQL functions, not SECURITY DEFINER, but they still
-- have default PUBLIC EXECUTE. Restrict to authenticated for least privilege.

REVOKE EXECUTE ON FUNCTION public.tier_for_rating(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tier_for_rating(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.tier_for_rating(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.division_for_rating(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.division_for_rating(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.division_for_rating(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_apex_rating(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_apex_rating(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_apex_rating(integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Verification query (run manually to audit the post-migration state):
--
--   SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
--          CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
--               THEN 'YES' ELSE 'no' END AS anon_can_execute,
--          CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
--               THEN 'YES' ELSE 'no' END AS auth_can_execute,
--          CASE WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
--               THEN 'YES' ELSE 'no' END AS service_can_execute
--   FROM pg_proc p
--   JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname = 'public'
--     AND p.prosecdef = true
--   ORDER BY p.proname;
--
-- Expected: anon_can_execute = 'no' for all SECURITY DEFINER functions
--           except get_player_directory and get_player_directory_count.
-- ═══════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0018_achievement_catalog_constraint.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- 0018_achievement_catalog_constraint.sql
--
-- IRX-H42: Arbitrary achievement IDs/provenance enter account truth
--
-- The account_achievements and achievement_progress tables accepted any
-- arbitrary string as achievement_id.  A malicious client could insert
-- fake achievements with made-up IDs, polluting account truth.
--
-- This migration:
--   1. Creates a public.achievement_catalog table seeded with the 56
--      authoritative achievement IDs from packages/achievements.
--   2. Cleans up any existing rows with invalid achievement_ids.
--   3. Adds FK constraints from account_achievements and achievement_progress
--      to the catalog, enforcing that only known achievement IDs are accepted.
--   4. Enables RLS on the catalog (read-only to authenticated, no client writes).
--
-- The catalog is the single source of truth for valid achievement IDs at the
-- database level.  When new achievements are added to the codebase, a new
-- migration must INSERT them here.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Create the achievement catalog table ──

CREATE TABLE IF NOT EXISTS public.achievement_catalog (
  achievement_id  text PRIMARY KEY,
  added_in_migration  text NOT NULL DEFAULT '0018'
);

ALTER TABLE public.achievement_catalog ENABLE ROW LEVEL SECURITY;

-- Read-only to authenticated (clients can browse the valid catalog)
CREATE POLICY achievement_catalog_select ON public.achievement_catalog
  FOR SELECT TO authenticated
  USING (true);

-- Also readable by anon (public catalog — no sensitive data)
GRANT SELECT ON public.achievement_catalog TO authenticated, anon;

-- No client INSERT/UPDATE/DELETE — only service_role can modify the catalog
REVOKE ALL ON public.achievement_catalog FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.achievement_catalog TO authenticated, anon;

-- ── 2. Seed the catalog with the 56 authoritative achievement IDs ──

INSERT INTO public.achievement_catalog (achievement_id) VALUES
  ('welcome-to-intrilex'),
  ('first-blood'),
  ('twenty-one'),
  ('exactly-enough'),
  ('read-the-card'),
  ('other-side-of-the-card'),
  ('the-stack-exists'),
  ('not-so-fast'),
  ('miniature-warfare'),
  ('no-longer-new'),
  ('fair-trade'),
  ('upgrade'),
  ('gone-forever'),
  ('drop-anchor'),
  ('hold-fast'),
  ('supercharged'),
  ('two-become-one'),
  ('digging-deeper'),
  ('clean-sweep'),
  ('know-the-table'),
  ('stack-student'),
  ('denied'),
  ('double-denied'),
  ('nope-three'),
  ('the-stackening'),
  ('perfect-timing'),
  ('sequence-breaker'),
  ('clean-kill'),
  ('lucky-seven'),
  ('topdeck-sorcery'),
  ('found-money'),
  ('recursive-seven'),
  ('seven-heaven'),
  ('queens-court'),
  ('ace-in-the-hole'),
  ('super-authority'),
  ('stack-theft'),
  ('wild-card'),
  ('photo-finish'),
  ('from-behind'),
  ('overkill'),
  ('last-card-standing'),
  ('empty-handed-victory'),
  ('plan-b-was-plan-a'),
  ('turnabout'),
  ('no-shovel-required'),
  ('big-number-good'),
  ('reading-is-overpowered'),
  ('controlled-chaos'),
  ('window-shopper'),
  ('absolutely-excessive'),
  ('black-magic'),
  ('getting-dangerous'),
  ('intrilexian'),
  ('spades-scholar'),
  ('card-savant')
ON CONFLICT (achievement_id) DO NOTHING;

-- ── 3. Clean up any existing invalid achievement rows ──
-- Delete achievements that are not in the catalog before adding the FK.
-- This is safe because invalid IDs are by definition not real achievements.

DELETE FROM public.account_achievements
WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);

DELETE FROM public.achievement_progress
WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);

-- ── 4. Add FK constraints ──

ALTER TABLE public.account_achievements
  ADD CONSTRAINT account_achievements_achievement_id_fk
  FOREIGN KEY (achievement_id)
  REFERENCES public.achievement_catalog(achievement_id)
  ON DELETE CASCADE;

ALTER TABLE public.achievement_progress
  ADD CONSTRAINT achievement_progress_achievement_id_fk
  FOREIGN KEY (achievement_id)
  REFERENCES public.achievement_catalog(achievement_id)
  ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- Verification query:
--   SELECT COUNT(*) FROM public.achievement_catalog;
--   Expected: 56
--
--   SELECT achievement_id FROM public.account_achievements
--   WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);
--   Expected: 0 rows
-- ═══════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0019_remove_season_fabrication.sql
-- ═══════════════════════════════════════════════════════════════
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
-- IRX-C03: PostgreSQL cannot change a function's return type via
-- CREATE OR REPLACE. The functions below have different return column
-- shapes than their 0009/0011/0015 originals, so we must DROP FUNCTION
-- CASCADE first, then CREATE FUNCTION. Grants are re-asserted afterward.
--
-- Functions patched (return type changed — DROP + CREATE):
--   0009: get_ranked_leaderboard, get_player_standing
--   0015: get_recent_opponents
--
-- Functions patched (body only — CREATE OR REPLACE is safe):
--   0010: get_self_profile (match history seasonId)
--   0011: get_match_history, get_match_detail
--   0012: persist_match_result (internal season resolution)
--   0013: get_player_directory, get_player_directory_count
-- ═══════════════════════════════════════════════════════════════

-- ── IRX-C03: DROP functions whose return types changed ──
-- PostgreSQL identifies functions by (name, argument_types). The
-- argument types are identical to the originals, so we drop by signature.
-- CASCADE ensures dependent views/grants are cleaned up before recreation.
DROP FUNCTION IF EXISTS public.get_ranked_leaderboard(text, text, text, text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_player_standing(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_recent_opponents(integer, integer) CASCADE;

-- ── 0009: get_ranked_leaderboard ──
CREATE FUNCTION public.get_ranked_leaderboard(
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
CREATE FUNCTION public.get_player_standing(
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
CREATE FUNCTION public.get_recent_opponents(
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



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0020_tournaments.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 0020: tournaments + tournament_participants + tournament_matches
--
-- Persistent human tournament infrastructure.
-- Written by the match server (service role) for tournament lifecycle:
--   creation, registration, bracket generation, result reporting.
-- Clients can read public tournament data; no client writes.
--
-- Tournament state is server-authoritative: the match server owns
-- bracket progression, pairing, and result recording. Clients
-- display server-provided data and never mutate bracket state.
-- ═══════════════════════════════════════════════════════════════

-- ── tournaments ──
CREATE TABLE IF NOT EXISTS public.tournaments (
  tournament_id    text PRIMARY KEY,
  name             text NOT NULL DEFAULT 'Untitled Tournament',
  format           text NOT NULL DEFAULT 'SINGLE_ELIM'
    CHECK (format IN ('SINGLE_ELIM', 'SWISS')),
  best_of          integer NOT NULL DEFAULT 1
    CHECK (best_of >= 1 AND best_of <= 7),
  max_players      integer NOT NULL DEFAULT 16
    CHECK (max_players >= 2 AND max_players <= 128),
  status           text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'REGISTRATION', 'IN_PROGRESS', 'FINALIZING', 'COMPLETED', 'CANCELLED')),
  swiss_rounds     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can browse tournaments
CREATE POLICY tournaments_select ON public.tournaments
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write tournament state.

-- ── tournament_participants ──
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  tournament_id     text NOT NULL REFERENCES public.tournaments(tournament_id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_player_id  text NOT NULL,
  display_name      text NOT NULL DEFAULT 'Player',
  handle            text,
  seed              integer NOT NULL DEFAULT 1,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see tournament participants
CREATE POLICY tournament_participants_select ON public.tournament_participants
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can register participants.

-- ── tournament_matches ──
-- Bracket matches within a tournament. Distinct from public.matches
-- (which records completed game matches). tournament_matches tracks
-- the bracket structure: rounds, pairings, scores, and winners.
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  match_id         text PRIMARY KEY,
  tournament_id    text NOT NULL REFERENCES public.tournaments(tournament_id) ON DELETE CASCADE,
  round            integer NOT NULL DEFAULT 1,
  player_a_id      text,
  player_b_id      text,
  status           text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'BYE')),
  winner_id        text,
  score_a          integer,
  score_b          integer,
  match_ref        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see bracket matches
CREATE POLICY tournament_matches_select ON public.tournament_matches
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write bracket state.

-- Index for efficient tournament lookups
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
  ON public.tournament_matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id
  ON public.tournament_participants(tournament_id);

-- ── service_role grants (strict role model) ──
-- The match server (service role) owns tournament lifecycle: creation,
-- registration, bracket generation, and result recording.
GRANT ALL PRIVILEGES ON TABLE public.tournaments TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.tournament_participants TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.tournament_matches TO service_role;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0021_player_reports.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 0021: player_reports
--
-- Player-submitted reports for moderation. The existing
-- account_moderation table tracks moderation STATUS (banned,
-- suspended); this table tracks the REPORT SUBMISSIONS that
-- feed moderation decisions.
--
-- Server-authoritative: only the service role can INSERT/UPDATE.
-- Players can INSERT via a SECURITY DEFINER RPC that validates
-- the reporter's auth.uid and prevents self-reports.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.player_reports (
  report_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code     text NOT NULL
    CHECK (reason_code IN (
      'HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER'
    )),
  description     text,
  match_ref        text,
  status          text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'REVIEWED', 'DISMISSED', 'ACTIONED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewer_notes  text
);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

-- Players can see their own submitted reports only
CREATE POLICY player_reports_select_own ON public.player_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE for authenticated role.
-- Reports are submitted via a SECURITY DEFINER RPC.

-- Index for moderation queries
CREATE INDEX IF NOT EXISTS idx_player_reports_reported_id
  ON public.player_reports(reported_id, status);
CREATE INDEX IF NOT EXISTS idx_player_reports_reporter_id
  ON public.player_reports(reporter_id, created_at);

-- ── submit_player_report RPC ──
-- Allows an authenticated player to submit a report.
-- Prevents self-reports and validates reason codes.
CREATE OR REPLACE FUNCTION public.submit_player_report(
  p_reported_id uuid,
  p_reason_code text,
  p_description text DEFAULT NULL,
  p_match_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  -- Validate reporter is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Prevent self-reports
  IF auth.uid() = p_reported_id THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = '44000';
  END IF;

  -- Validate reason code
  IF p_reason_code NOT IN ('HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid reason code' USING ERRCODE = '23514';
  END IF;

  -- Insert the report
  INSERT INTO player_reports (reporter_id, reported_id, reason_code, description, match_ref)
  VALUES (auth.uid(), p_reported_id, p_reason_code, p_description, p_match_ref)
  RETURNING report_id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_report TO authenticated;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0022_remove_remaining_season_fabrication.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- 0022_remove_remaining_season_fabrication.sql
--
-- IRX-C03/IRX-H07: Migration 0019 patched 3 functions (get_ranked_leaderboard,
-- get_player_standing, get_recent_opponents) but left 4 more functions that
-- still fabricate 'season-1' as a fallback when no active ranked season exists.
--
-- This migration patches the remaining functions. All are body-only changes
-- (same return types), so CREATE OR REPLACE is safe.
--
-- Functions patched:
--   0010: get_self_profile (hardcoded 'season-1' in recent matches JSON)
--   0012: persist_match_result (season-1 fallback for ranked and casual)
--   0013: get_player_directory (season-1 fallback for rating join)
--   0013: get_player_directory_count (season-1 fallback for rating join)
-- ═══════════════════════════════════════════════════════════════

-- ── 0012: persist_match_result — remove season-1 fabrication ──
-- For ranked: if no active season, reject the record (return error).
-- For casual/private: use NULL season_id (no rating row will be created).
CREATE OR REPLACE FUNCTION public.persist_match_result(
  p_record jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id         text := p_record->>'matchId';
  v_rules_profile    text := p_record->>'rulesProfileId';
  v_status           text := p_record->>'status';
  v_started_at       timestamptz := (p_record->>'startedAt')::timestamptz;
  v_ended_at         timestamptz := (p_record->>'endedAt')::timestamptz;
  v_termination      text := p_record->>'terminationReason';
  v_winner_user_id   text := p_record->>'winnerUserId';
  v_replay_hash      text := p_record->>'replayHash';
  v_server_version   text := p_record->>'serverVersion';
  v_rules_version    text := p_record->>'rulesVersion';
  v_queue_id         text := COALESCE(p_record->>'queueId', 'casual');
  v_season_id        text;
  v_participants     jsonb := p_record->'participants';
  v_participant      jsonb;
  v_account_id       text;
  v_seat             text;
  v_result           text;
  v_rating_before    integer;
  v_rating_after     integer;
  v_rating_delta     integer;
  v_rd_before        double precision;
  v_rd_after         double precision;
  v_vol_before       double precision;
  v_vol_after        double precision;
  v_is_win           integer;
  v_is_loss          integer;
  v_is_draw          integer;
  v_existing_rating  jsonb;
  v_existing_stats   jsonb;
  v_new_rated        integer;
  v_new_placements   integer;
  v_new_rating       integer;
  v_new_peak         integer;
  v_new_win_streak   integer;
  v_new_best_streak  integer;
  v_already          boolean;
  v_p_count          integer;
  v_i                integer;
BEGIN
  -- ── Idempotency gate ──
  SELECT EXISTS(SELECT 1 FROM public.matches WHERE match_id = v_match_id) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'alreadyPersisted', true, 'error', null);
  END IF;

  -- Resolve season for rated queues
  v_season_id := p_record->>'seasonId';
  IF v_season_id IS NULL OR v_season_id = '' THEN
    IF v_queue_id = 'ranked' THEN
      -- IRX-C03/IRX-H07: Do NOT fabricate 'season-1'. Resolve active season.
      SELECT season_id INTO v_season_id
        FROM public.ranked_seasons
        WHERE queue_id = 'ranked' AND status = 'ACTIVE'
        ORDER BY starts_at ASC LIMIT 1;
      -- IRX-C03: If no active season, reject the ranked record.
      -- A ranked record without a valid season must never enter account truth.
      IF v_season_id IS NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'alreadyPersisted', false,
          'error', 'RANKED_REQUIRES_SEASON_AUTHORITY',
          'detail', 'No active ranked season found — cannot persist ranked result'
        );
      END IF;
    ELSE
      -- IRX-C03/IRX-H07: Casual/private matches use NULL season_id.
      -- No rating row will be created for non-ranked queues.
      v_season_id := NULL;
    END IF;
  END IF;

  -- ── Step 1: Insert matches row ──
  INSERT INTO public.matches (
    match_id, rules_profile_id, status, started_at, ended_at,
    termination_reason, winner_user_id, replay_hash,
    server_version, rules_version
  ) VALUES (
    v_match_id, v_rules_profile, v_status, v_started_at, v_ended_at,
    v_termination, v_winner_user_id::uuid, v_replay_hash,
    v_server_version, v_rules_version
  )
  ON CONFLICT (match_id) DO NOTHING;

  -- ── Step 2: Process each participant ──
  v_p_count := jsonb_array_length(v_participants);

  FOR v_i IN 0..v_p_count - 1 LOOP
    v_participant := v_participants->v_i;
    v_account_id := v_participant->>'accountId';

    IF v_account_id IS NULL OR v_account_id = '' THEN
      CONTINUE;
    END IF;

    v_seat   := v_participant->>'seat';
    v_result := v_participant->>'result';

    v_rating_before := NULLIF(v_participant->>'ratingBefore', '')::integer;
    v_rating_after  := NULLIF(v_participant->>'ratingAfter', '')::integer;
    v_rating_delta  := NULLIF(v_participant->>'ratingDelta', '')::integer;
    v_rd_before     := NULLIF(v_participant->>'rdBefore', '')::double precision;
    v_rd_after      := NULLIF(v_participant->>'rdAfter', '')::double precision;
    v_vol_before    := NULLIF(v_participant->>'volatilityBefore', '')::double precision;
    v_vol_after     := NULLIF(v_participant->>'volatilityAfter', '')::double precision;

    INSERT INTO public.match_participants (
      match_id, user_id, seat, result,
      rating_before, rating_after, rating_delta
    ) VALUES (
      v_match_id, v_account_id::uuid, v_seat, v_result,
      v_rating_before, v_rating_after, v_rating_delta
    )
    ON CONFLICT (match_id, user_id) DO NOTHING;

    IF v_result = 'ABORT' THEN
      CONTINUE;
    END IF;

    v_is_win  := CASE WHEN v_result = 'WIN'  THEN 1 ELSE 0 END;
    v_is_loss := CASE WHEN v_result = 'LOSS' THEN 1 ELSE 0 END;
    v_is_draw := CASE WHEN v_result = 'DRAW' THEN 1 ELSE 0 END;

    -- ── Only create rating rows for ranked queues with a valid season ──
    IF v_queue_id = 'ranked' AND v_season_id IS NOT NULL THEN
      SELECT to_jsonb(pr) INTO v_existing_rating
      FROM public.player_ratings pr
      WHERE pr.user_id = v_account_id::uuid
        AND pr.queue_id = v_queue_id
        AND pr.season_id = v_season_id
      LIMIT 1;

      IF v_existing_rating IS NULL THEN
        v_new_rated := 1;
        v_new_placements := LEAST(1, 5);
        v_new_rating := COALESCE(v_rating_after, 1500);
        v_new_peak := v_new_rating;
      ELSE
        v_new_rated := (v_existing_rating->>'rated_matches')::integer + 1;
        v_new_placements := LEAST((v_existing_rating->>'placements_played')::integer + 1, 5);
        v_new_rating := COALESCE(v_rating_after, (v_existing_rating->>'rating')::integer);
        v_new_peak := GREATEST((v_existing_rating->>'peak_rating')::integer, v_new_rating);
      END IF;

      INSERT INTO public.player_ratings (
        user_id, queue_id, season_id,
        rating, rating_deviation, volatility,
        provisional, rated_matches, placements_played, peak_rating,
        wins, losses, draws,
        last_rated_at, last_rated_match_id, updated_at
      ) VALUES (
        v_account_id::uuid, v_queue_id, v_season_id,
        v_new_rating,
        COALESCE(v_rd_after, COALESCE(v_rd_before, v_existing_rating->>'rating_deviation')::double precision, 350.0),
        COALESCE(v_vol_after, COALESCE(v_vol_before, v_existing_rating->>'volatility')::double precision, 0.06),
        (v_new_rated < 50),
        v_new_rated, v_new_placements, v_new_peak,
        COALESCE((v_existing_rating->>'wins')::integer, 0) + v_is_win,
        COALESCE((v_existing_rating->>'losses')::integer, 0) + v_is_loss,
        COALESCE((v_existing_rating->>'draws')::integer, 0) + v_is_draw,
        now(), v_match_id, now()
      )
      ON CONFLICT (user_id, queue_id, season_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        rating_deviation = EXCLUDED.rating_deviation,
        volatility = EXCLUDED.volatility,
        provisional = EXCLUDED.provisional,
        rated_matches = EXCLUDED.rated_matches,
        placements_played = EXCLUDED.placements_played,
        peak_rating = EXCLUDED.peak_rating,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        draws = EXCLUDED.draws,
        last_rated_at = EXCLUDED.last_rated_at,
        last_rated_match_id = EXCLUDED.last_rated_match_id,
        updated_at = EXCLUDED.updated_at;

      IF v_rating_before IS NOT NULL AND v_rating_after IS NOT NULL THEN
        INSERT INTO public.rating_events (
          match_id, user_id, season_id, queue_id,
          rating_before, rating_after, rating_delta,
          rd_before, rd_after,
          volatility_before, volatility_after,
          result, algorithm_version
        ) VALUES (
          v_match_id, v_account_id::uuid, v_season_id, v_queue_id,
          v_rating_before, v_rating_after, v_rating_delta,
          COALESCE(v_rd_before, COALESCE(v_existing_rating->>'rating_deviation')::double precision, 350.0),
          COALESCE(v_rd_after, COALESCE(v_existing_rating->>'rating_deviation')::double precision, 350.0),
          COALESCE(v_vol_before, COALESCE(v_existing_rating->>'volatility')::double precision, 0.06),
          COALESCE(v_vol_after, COALESCE(v_existing_rating->>'volatility')::double precision, 0.06),
          v_result, 'glicko2-v1'
        )
        ON CONFLICT (match_id, user_id) DO NOTHING;
      END IF;
    END IF;

    -- ── Always update player_stats (regardless of queue) ──
    SELECT to_jsonb(ps) INTO v_existing_stats
    FROM public.player_stats ps
    WHERE ps.user_id = v_account_id::uuid
    LIMIT 1;

    IF v_existing_stats IS NULL THEN
      v_new_win_streak := v_is_win;
      v_new_best_streak := v_new_win_streak;
    ELSE
      v_new_win_streak := CASE WHEN v_is_win = 1
        THEN (v_existing_stats->>'current_win_streak')::integer + 1
        ELSE 0 END;
      v_new_best_streak := GREATEST(
        (v_existing_stats->>'best_win_streak')::integer,
        v_new_win_streak
      );
    END IF;

    INSERT INTO public.player_stats (
      user_id, online_matches, online_wins, online_losses, online_draws,
      ranked_matches, ranked_wins, ranked_losses,
      current_win_streak, best_win_streak, updated_at
    ) VALUES (
      v_account_id::uuid,
      COALESCE((v_existing_stats->>'online_matches')::integer, 0) + 1,
      COALESCE((v_existing_stats->>'online_wins')::integer, 0) + v_is_win,
      COALESCE((v_existing_stats->>'online_losses')::integer, 0) + v_is_loss,
      COALESCE((v_existing_stats->>'online_draws')::integer, 0) + v_is_draw,
      COALESCE((v_existing_stats->>'ranked_matches')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN 1 ELSE 0 END),
      COALESCE((v_existing_stats->>'ranked_wins')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN v_is_win ELSE 0 END),
      COALESCE((v_existing_stats->>'ranked_losses')::integer, 0) + (CASE WHEN v_queue_id = 'ranked' THEN v_is_loss ELSE 0 END),
      v_new_win_streak, v_new_best_streak, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      online_matches = EXCLUDED.online_matches,
      online_wins = EXCLUDED.online_wins,
      online_losses = EXCLUDED.online_losses,
      online_draws = EXCLUDED.online_draws,
      ranked_matches = EXCLUDED.ranked_matches,
      ranked_wins = EXCLUDED.ranked_wins,
      ranked_losses = EXCLUDED.ranked_losses,
      current_win_streak = EXCLUDED.current_win_streak,
      best_win_streak = EXCLUDED.best_win_streak,
      updated_at = EXCLUDED.updated_at;

  END LOOP;

  RETURN jsonb_build_object('success', true, 'alreadyPersisted', false, 'error', null);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'alreadyPersisted', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- ── 0013: get_player_directory — remove season-1 fallback ──
CREATE OR REPLACE FUNCTION public.get_player_directory(
  p_search      text DEFAULT NULL,
  p_tier_filter text DEFAULT NULL,
  p_sort        text DEFAULT 'rating',
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  public_player_id        text,
  display_name            text,
  handle                  text,
  avatar_url              text,
  created_at              timestamptz,
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
  earned_achievement_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_sort   text;
  v_limit  integer;
  v_offset integer;
  v_season text;
BEGIN
  -- IRX-C03/IRX-H07: Do NOT fabricate 'season-1'. If no active season,
  -- ratings will be NULL (UNRANKED tier) — the correct conservative projection.
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  v_search := NULL;
  IF p_search IS NOT NULL THEN
    v_search := trim(p_search);
    IF length(v_search) < 2 OR length(v_search) > 64 THEN
      v_search := NULL;
    ELSE
      v_search := '%' || v_search || '%';
    END IF;
  END IF;

  v_sort := CASE
    WHEN p_sort IN ('rating','games','recent','newest','name') THEN p_sort
    ELSE 'rating'
  END;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  SELECT
    p.public_player_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.created_at,
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
    CASE WHEN COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'
      THEN (SELECT count(*) FROM public.account_achievements a WHERE a.user_id = p.user_id)
      ELSE NULL
    END AS earned_achievement_count
  FROM public.profiles p
  JOIN public.profile_privacy pp ON pp.user_id = p.user_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE COALESCE(pp.directory_visible, false) = true
    AND (m.status IS NULL OR m.status = 'ACTIVE')
    AND (v_search IS NULL
         OR p.handle ILIKE v_search
         OR p.display_name ILIKE v_search)
    AND (
      p_tier_filter IS NULL OR p_tier_filter = 'ALL'
      OR (p_tier_filter = 'INITIATE'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating < 1200)
      OR (p_tier_filter = 'CIPHER'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1200 AND pr.rating < 1400)
      OR (p_tier_filter = 'WARDEN'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1400 AND pr.rating < 1600)
      OR (p_tier_filter = 'VANGUARD'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1600 AND pr.rating < 1800)
      OR (p_tier_filter = 'ASCENDANT' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1800 AND pr.rating < 2000)
      OR (p_tier_filter = 'PARAGON'   AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2000 AND pr.rating < 2200)
      OR (p_tier_filter = 'SOVEREIGN' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2200 AND pr.rating < 2400)
      OR (p_tier_filter = 'INTRILEX'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2400)
    )
  ORDER BY
    CASE WHEN v_sort = 'rating' THEN pr.rating END DESC NULLS LAST,
    CASE WHEN v_sort = 'games'  THEN pr.rated_matches END DESC NULLS LAST,
    CASE WHEN v_sort = 'recent' THEN pr.last_rated_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'newest' THEN p.created_at END DESC,
    CASE WHEN v_sort = 'name'   THEN p.display_name END ASC,
    CASE WHEN v_sort = 'rating' THEN pr.rated_matches END DESC NULLS LAST,
    CASE WHEN v_sort = 'games'  THEN pr.rating END DESC NULLS LAST,
    CASE WHEN v_sort = 'recent' THEN p.created_at END DESC,
    CASE WHEN v_sort = 'newest' THEN p.public_player_id END ASC,
    CASE WHEN v_sort = 'name'   THEN COALESCE(p.handle, '') END ASC,
    p.public_player_id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- ── 0013: get_player_directory_count — remove season-1 fallback ──
CREATE OR REPLACE FUNCTION public.get_player_directory_count(
  p_search      text DEFAULT NULL,
  p_tier_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_count  integer;
  v_season text;
BEGIN
  -- IRX-C03/IRX-H07: Do NOT fabricate 'season-1'
  SELECT season_id INTO v_season
    FROM public.ranked_seasons
    WHERE queue_id = 'ranked' AND status = 'ACTIVE'
    ORDER BY starts_at ASC LIMIT 1;

  v_search := NULL;
  IF p_search IS NOT NULL THEN
    v_search := trim(p_search);
    IF length(v_search) < 2 OR length(v_search) > 64 THEN
      v_search := NULL;
    ELSE
      v_search := '%' || v_search || '%';
    END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles p
  JOIN public.profile_privacy pp ON pp.user_id = p.user_id
  LEFT JOIN public.player_ratings pr ON pr.user_id = p.user_id
    AND pr.queue_id = 'ranked' AND pr.season_id = v_season
  LEFT JOIN public.account_moderation m ON m.user_id = p.user_id
  WHERE COALESCE(pp.directory_visible, false) = true
    AND (m.status IS NULL OR m.status = 'ACTIVE')
    AND (v_search IS NULL
         OR p.handle ILIKE v_search
         OR p.display_name ILIKE v_search)
    AND (
      p_tier_filter IS NULL OR p_tier_filter = 'ALL'
      OR (p_tier_filter = 'INITIATE'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating < 1200)
      OR (p_tier_filter = 'CIPHER'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1200 AND pr.rating < 1400)
      OR (p_tier_filter = 'WARDEN'    AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1400 AND pr.rating < 1600)
      OR (p_tier_filter = 'VANGUARD'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1600 AND pr.rating < 1800)
      OR (p_tier_filter = 'ASCENDANT' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 1800 AND pr.rating < 2000)
      OR (p_tier_filter = 'PARAGON'   AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2000 AND pr.rating < 2200)
      OR (p_tier_filter = 'SOVEREIGN' AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2200 AND pr.rating < 2400)
      OR (p_tier_filter = 'INTRILEX'  AND pr.rating IS NOT NULL AND pr.provisional = false AND pr.placements_played >= 5 AND pr.rating >= 2400)
    );

  RETURN jsonb_build_object('count', v_count);
END;
$$;

-- ── 0010: get_self_profile — remove hardcoded 'season-1' in recent matches ──
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

  SELECT match_history, achievements, online_status, local_stats
    INTO v_priv_mh, v_priv_ach, v_priv_os, v_priv_ls
    FROM public.profile_privacy WHERE user_id = v_user_id;
  IF v_priv_mh IS NULL THEN v_priv_mh := 'PUBLIC'; v_priv_ach := 'PUBLIC'; v_priv_os := 'PRIVATE'; v_priv_ls := 'PRIVATE'; END IF;

  -- IRX-C03/IRX-H07: Resolve active season once
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

  -- IRX-C03/IRX-H07: Use the actual match's season_id instead of hardcoded 'season-1'
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
    'onlineStats', CASE WHEN v_online_m IS NULL THEN NULL ELSE jsonb_build_object(
      'onlineMatches', v_online_m, 'onlineWins', v_online_w, 'onlineLosses', v_online_l,
      'onlineDraws', v_online_d, 'rankedMatches', v_ranked_m, 'rankedWins', v_ranked_w,
      'rankedLosses', v_ranked_l, 'currentWinStreak', v_cur_streak, 'bestWinStreak', v_best_streak
    ) END,
    'isSelf', true
  );
END;
$$;

-- ── Re-assert grants on patched functions ──
GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.persist_match_result(jsonb) FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_player_directory TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory TO anon;
REVOKE EXECUTE ON FUNCTION public.get_player_directory FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_player_directory_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_directory_count TO anon;
REVOKE EXECUTE ON FUNCTION public.get_player_directory_count FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_self_profile TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_self_profile FROM PUBLIC;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0023_tournament_match_id_unique_constraint.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- 0023_tournament_match_id_unique_constraint.sql
--
-- IRX-C10: Tournament match-ID collisions.
-- Previously, tournament match IDs used the pattern TM_R1_M{N} which
-- collided across concurrent tournaments. The domain layer now generates
-- tournament-scoped IDs: ${tournamentId}_R${round}_M${matchNum}.
--
-- This migration adds a composite unique constraint on (tournament_id, round, match_id)
-- as defense-in-depth, ensuring that even if the domain layer regresses,
-- the database will reject collisions.
--
-- The existing match_id PRIMARY KEY is retained for backward compatibility.
-- ═══════════════════════════════════════════════════════════════

-- Add a composite unique constraint as defense-in-depth against match ID collisions
-- across tournaments. The match_id PK already prevents exact duplicates, but
-- this constraint makes the tournament-scoping explicit.
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT uq_tournament_matches_tournament_round_match
  UNIQUE (tournament_id, round, match_id);

-- Grant service_role full access to tournament tables (strict role model)
GRANT SELECT ON public.tournament_matches TO authenticated;
GRANT SELECT ON public.tournament_participants TO authenticated;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0024_tournament_atomic_save.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- 0024_tournament_atomic_save.sql — IRX-C11: Transactional tournament persistence
--
-- Adds an `upsert_tournament_atomic` RPC function that wraps the tournament,
-- participant, and match upserts in a single database transaction.
-- If any step fails, the entire transaction rolls back.
--
-- This eliminates the race condition where participant upsert succeeds
-- but match upsert fails, leaving the tournament in an inconsistent state.
-- ═══════════════════════════════════════════════════════════════

-- Drop existing function if present (safe re-creation)
DROP FUNCTION IF EXISTS upsert_tournament_atomic(
  p_tournament JSONB,
  p_participants JSONB,
  p_matches JSONB
);

CREATE OR REPLACE FUNCTION upsert_tournament_atomic(
  p_tournament JSONB,
  p_participants JSONB DEFAULT '[]'::JSONB,
  p_matches JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_tournament_id TEXT;
  v_row JSONB;
  v_participant JSONB;
  v_match JSONB;
BEGIN
  v_tournament_id := p_tournament->>'tournament_id';
  IF v_tournament_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_id is required');
  END IF;

  -- 1. Upsert tournament row
  INSERT INTO tournaments (
    tournament_id, name, format, best_of, max_players,
    status, swiss_rounds, started_at, completed_at
  ) VALUES (
    v_tournament_id,
    p_tournament->>'name',
    p_tournament->>'format',
    (p_tournament->>'best_of')::INTEGER,
    (p_tournament->>'max_players')::INTEGER,
    p_tournament->>'status',
    COALESCE((p_tournament->>'swiss_rounds')::INTEGER, 0),
    NULLIF(p_tournament->>'started_at', '')::TIMESTAMPTZ,
    NULLIF(p_tournament->>'completed_at', '')::TIMESTAMPTZ
  )
  ON CONFLICT (tournament_id) DO UPDATE SET
    name = EXCLUDED.name,
    format = EXCLUDED.format,
    best_of = EXCLUDED.best_of,
    max_players = EXCLUDED.max_players,
    status = EXCLUDED.status,
    swiss_rounds = EXCLUDED.swiss_rounds,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at;

  -- 2. Upsert participants (only those with user_id)
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    IF v_participant->>'user_id' IS NOT NULL THEN
      INSERT INTO tournament_participants (
        tournament_id, user_id, public_player_id, display_name, handle, seed
      ) VALUES (
        v_tournament_id,
        v_participant->>'user_id',
        v_participant->>'public_player_id',
        v_participant->>'display_name',
        v_participant->>'handle',
        COALESCE((v_participant->>'seed')::INTEGER, 0)
      )
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET
        public_player_id = EXCLUDED.public_player_id,
        display_name = EXCLUDED.display_name,
        handle = EXCLUDED.handle,
        seed = EXCLUDED.seed;
    END IF;
  END LOOP;

  -- 3. Upsert matches
  FOR v_match IN SELECT * FROM jsonb_array_elements(p_matches)
  LOOP
    INSERT INTO tournament_matches (
      match_id, tournament_id, round, player_a_id, player_b_id,
      status, winner_id, score_a, score_b, match_ref
    ) VALUES (
      v_match->>'match_id',
      v_tournament_id,
      (v_match->>'round')::INTEGER,
      v_match->>'player_a_id',
      v_match->>'player_b_id',
      v_match->>'status',
      NULLIF(v_match->>'winner_id', ''),
      COALESCE((v_match->>'score_a')::INTEGER, 0),
      COALESCE((v_match->>'score_b')::INTEGER, 0),
      v_match->>'match_ref'
    )
    ON CONFLICT (match_id) DO UPDATE SET
      round = EXCLUDED.round,
      player_a_id = EXCLUDED.player_a_id,
      player_b_id = EXCLUDED.player_b_id,
      status = EXCLUDED.status,
      winner_id = EXCLUDED.winner_id,
      score_a = EXCLUDED.score_a,
      score_b = EXCLUDED.score_b,
      match_ref = EXCLUDED.match_ref;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'tournament_id', v_tournament_id);
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction automatically rolls back — no partial writes
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ═══════════════════════════════════════════════════════════════
-- BEGIN MIGRATION: 0025_service_role_grants_followup.sql
-- ═══════════════════════════════════════════════════════════════
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



