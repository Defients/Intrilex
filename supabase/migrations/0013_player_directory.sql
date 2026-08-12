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
    -- Primary sort key (descending sorts use NEGATE for numeric, epoch for timestamps)
    CASE
      WHEN v_sort = 'rating'  THEN -COALESCE(pr.rating, -1)
      WHEN v_sort = 'games'   THEN -COALESCE(pr.rated_matches, 0)
      WHEN v_sort = 'recent'  THEN -EXTRACT(EPOCH FROM COALESCE(pr.last_rated_at, '1970-01-01'::timestamptz))::bigint
      WHEN v_sort = 'newest'  THEN -EXTRACT(EPOCH FROM p.created_at)::bigint
      WHEN v_sort = 'name'    THEN p.display_name
    END,
    -- Secondary sort key
    CASE
      WHEN v_sort = 'rating'  THEN -COALESCE(pr.rated_matches, 0)
      WHEN v_sort = 'games'   THEN -COALESCE(pr.rating, -1)
      WHEN v_sort = 'recent'  THEN -EXTRACT(EPOCH FROM p.created_at)::bigint
      WHEN v_sort = 'newest'  THEN p.public_player_id
      WHEN v_sort = 'name'    THEN COALESCE(p.handle, '')
    END,
    -- Tertiary sort key (tiebreaker)
    CASE
      WHEN v_sort IN ('rating','games','recent') THEN p.public_player_id
      WHEN v_sort = 'newest' THEN p.public_player_id
      ELSE p.public_player_id
    END
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

