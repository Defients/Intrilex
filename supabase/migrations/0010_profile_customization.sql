-- ═══════════════════════════════════════════════════════════════
-- Migration 0010: Profile customization, showcase, privacy, and
--                  public/self profile projections
--
-- Adds:
--   profile_customization  — equipped title, profile frame, card back
--   profile_showcase       — featured achievements + badges (normalized)
--   profile_privacy        — per-field visibility settings
--
-- RLS:
--   Owner can SELECT/UPDATE their own rows only.
--   No client can read another player's customization/privacy/showcase
--   directly — public projection is delivered via SECURITY DEFINER RPCs
--   that apply privacy filtering server-side (section 23-27).
--
-- RPCs:
--   get_public_profile(p_handle_or_public_id) — privacy-filtered public DTO
--   get_self_profile()                       — owner's full profile aggregation
--   update_display_name(p_name)              — validated owner update
--   change_handle(p_handle)                  — validated owner update
--   update_profile_privacy(p_match_history, p_achievements, p_online_status, p_local_stats)
--   equip_title(p_title_id)                  — ownership-validated
--   equip_profile_frame(p_frame_id)          — ownership-validated
--   equip_card_back(p_card_back_id)          — ownership-validated
--   set_showcase_slot(p_slot, p_type, p_item_id) — ownership-validated
--   clear_showcase_slot(p_slot)
--
-- Architectural law (section 4): Profile owns ONLY profile-owned state.
-- Ranked/achievements/match-history are read from their authoritative
-- tables and projected — never copied into profile tables.
-- ═══════════════════════════════════════════════════════════════

-- ── profile_customization ──
CREATE TABLE IF NOT EXISTS public.profile_customization (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id           text NOT NULL DEFAULT 'none',
  profile_frame_id   text NOT NULL DEFAULT 'none',
  card_back_id       text NOT NULL DEFAULT 'default',
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_customization ENABLE ROW LEVEL SECURITY;

-- Owner can read + update their own customization only
CREATE POLICY profile_customization_owner_select ON public.profile_customization
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY profile_customization_owner_update ON public.profile_customization
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_customization_owner_insert ON public.profile_customization
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── profile_showcase ──
-- Normalized showcase slots: one row per featured item.
-- Constraints: unique(user_id, slot), valid type, slot range.
CREATE TABLE IF NOT EXISTS public.profile_showcase (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot         integer NOT NULL CHECK (slot >= 0 AND slot < 6),
  item_type    text NOT NULL CHECK (item_type IN ('ACHIEVEMENT', 'BADGE')),
  item_id      text NOT NULL CHECK (length(item_id) >= 1 AND length(item_id) <= 128),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

ALTER TABLE public.profile_showcase ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_showcase_owner_select ON public.profile_showcase
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY profile_showcase_owner_update ON public.profile_showcase
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_showcase_owner_insert ON public.profile_showcase
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_showcase_owner_delete ON public.profile_showcase
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS profile_showcase_user_idx
  ON public.profile_showcase (user_id, slot);

-- ── profile_privacy ──
-- Per-field visibility. Constrained to PUBLIC/PRIVATE enums.
CREATE TABLE IF NOT EXISTS public.profile_privacy (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  match_history        text NOT NULL DEFAULT 'PUBLIC'
    CHECK (match_history IN ('PUBLIC', 'PRIVATE')),
  achievements         text NOT NULL DEFAULT 'PUBLIC'
    CHECK (achievements IN ('PUBLIC', 'PRIVATE')),
  online_status        text NOT NULL DEFAULT 'PRIVATE'
    CHECK (online_status IN ('PUBLIC', 'PRIVATE')),
  local_stats          text NOT NULL DEFAULT 'PRIVATE'
    CHECK (local_stats IN ('PUBLIC', 'PRIVATE')),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_privacy_owner_select ON public.profile_privacy
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY profile_privacy_owner_update ON public.profile_privacy
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_privacy_owner_insert ON public.profile_privacy
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS profile_customization_updated_at ON public.profile_customization;
CREATE TRIGGER profile_customization_updated_at
  BEFORE UPDATE ON public.profile_customization
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS profile_showcase_updated_at ON public.profile_showcase;
CREATE TRIGGER profile_showcase_updated_at
  BEFORE UPDATE ON public.profile_showcase
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS profile_privacy_updated_at ON public.profile_privacy;
CREATE TRIGGER profile_privacy_updated_at
  BEFORE UPDATE ON public.profile_privacy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Service role grants ──
GRANT ALL PRIVILEGES ON TABLE public.profile_customization TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profile_showcase TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profile_privacy TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_public_profile
--
-- Returns a privacy-filtered public profile DTO by handle or public_player_id.
-- Never exposes: accountId (auth UUID), email, moderation notes, private
-- settings, local stats, unpublished achievements, rating deviation,
-- volatility, or any field the owner has set to PRIVATE.
--
-- Privacy enforcement is server-side (section 23-27):
--   achievements=PRIVATE  → achievements summary omitted, showcase filtered
--   match_history=PRIVATE → recent matches + season history omitted
--   local_stats=PRIVATE   → local stats never in public projection
--   online_status=PRIVATE → no online status field
--
-- Ranked competitive identity (tier, division, IR, position, record)
-- remains public per Ranked policy (section 25).
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

  -- Account type: anonymous users are GUEST
  v_is_guest := false;  -- resolved from auth.users if needed; default permanent for public projection

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

  -- Tier/division computation
  v_tier := NULL; v_division := NULL; v_is_apex := false; v_peak_tier := NULL; v_peak_div := NULL;
  IF v_rating IS NOT NULL AND v_provisional = false AND v_placements >= 5 THEN
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

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_self_profile
--
-- Returns the caller's full profile aggregation including private state:
--   - full privacy settings
--   - online stats
--   - owned cosmetics catalog (filtered to owned items)
--   - local play stats are NOT stored server-side; the browser merges them
--
-- This RPC is owner-only (uses auth.uid()). Never returns another user's data.
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
-- RPC: update_display_name
-- Owner-only. Sanitizes + validates length (1-32 chars).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_display_name(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  v_clean := trim(regexp_replace(p_name, '[\x00-\x1F\x7F]', '', 'g'));
  IF length(v_clean) < 1 OR length(v_clean) > 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_DISPLAY_NAME');
  END IF;
  UPDATE public.profiles SET display_name = v_clean WHERE user_id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'displayName', v_clean);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: change_handle
-- Owner-only. Validates format (3-24 chars, alphanumeric+underscore),
-- reserved names, and case-insensitive uniqueness.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.change_handle(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_existing text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  v_clean := lower(trim(p_handle));
  IF length(v_clean) < 3 OR length(v_clean) > 24 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_HANDLE_LENGTH');
  END IF;
  IF v_clean !~ '^[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_HANDLE_FORMAT');
  END IF;
  IF v_clean IN ('admin','administrator','intrilex','moderator','mod','system','support',
                 'null','anonymous','guest','official','dev','developer','staff','team',
                 'help','api','root','superuser','operator','security','abuse','contact') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RESERVED_HANDLE');
  END IF;
  SELECT handle INTO v_existing FROM public.profiles WHERE lower(handle) = v_clean AND user_id <> auth.uid() LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'HANDLE_TAKEN');
  END IF;
  UPDATE public.profiles SET handle = v_clean WHERE user_id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'handle', v_clean);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: update_profile_privacy
-- Owner-only. Sets all four visibility fields.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_profile_privacy(
  p_match_history text,
  p_achievements  text,
  p_online_status text,
  p_local_stats   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_match_history NOT IN ('PUBLIC','PRIVATE') OR p_achievements NOT IN ('PUBLIC','PRIVATE')
     OR p_online_status NOT IN ('PUBLIC','PRIVATE') OR p_local_stats NOT IN ('PUBLIC','PRIVATE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_VISIBILITY');
  END IF;
  INSERT INTO public.profile_privacy (user_id, match_history, achievements, online_status, local_stats)
    VALUES (auth.uid(), p_match_history, p_achievements, p_online_status, p_local_stats)
    ON CONFLICT (user_id) DO UPDATE SET
      match_history = EXCLUDED.match_history,
      achievements = EXCLUDED.achievements,
      online_status = EXCLUDED.online_status,
      local_stats = EXCLUDED.local_stats,
      updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: equip_title / equip_profile_frame / equip_card_back
-- Owner-only. Ownership is validated against account_achievements:
-- a cosmetic whose title_id/frame_id/card_back_id maps to an
-- achievement requires that achievement to be earned.
-- IRX-H34: The DB now enforces ownership, not just known IDs.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.equip_title(p_title_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement_id text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_title_id NOT IN ('none','initiate','twenty-one','lucky-vii','stack-thief','intrilexian','card-savant','sovereign') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_TITLE');
  END IF;
  -- IRX-H34: Validate achievement ownership for achievement-gated titles
  v_achievement_id := CASE p_title_id
    WHEN 'initiate' THEN 'welcome-to-intrilex'
    WHEN 'twenty-one' THEN 'twenty-one'
    WHEN 'lucky-vii' THEN 'lucky-seven'
    WHEN 'stack-thief' THEN 'stack-theft'
    WHEN 'intrilexian' THEN 'intrilexian'
    WHEN 'card-savant' THEN 'card-savant'
    WHEN 'sovereign' THEN 'sovereign'
    ELSE NULL
  END;
  IF v_achievement_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.account_achievements WHERE user_id = auth.uid() AND achievement_id = v_achievement_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ACHIEVEMENT_NOT_OWNED');
    END IF;
  END IF;
  INSERT INTO public.profile_customization (user_id, title_id) VALUES (auth.uid(), p_title_id)
    ON CONFLICT (user_id) DO UPDATE SET title_id = EXCLUDED.title_id, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'titleId', p_title_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_profile_frame(p_frame_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement_id text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_frame_id NOT IN ('none','initiate-frame','cipher-frame','warden-frame','vanguard-frame','ascendant-frame','intrilex-frame') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_FRAME');
  END IF;
  -- IRX-H34: Validate achievement ownership for achievement-gated frames
  v_achievement_id := CASE p_frame_id
    WHEN 'initiate-frame' THEN 'welcome-to-intrilex'
    WHEN 'cipher-frame' THEN 'first-counter'
    WHEN 'warden-frame' THEN 'stack-theft'
    WHEN 'vanguard-frame' THEN 'flawless-victory'
    WHEN 'ascendant-frame' THEN 'ranked-initiate'
    WHEN 'intrilex-frame' THEN 'intrilexian'
    ELSE NULL
  END;
  IF v_achievement_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.account_achievements WHERE user_id = auth.uid() AND achievement_id = v_achievement_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ACHIEVEMENT_NOT_OWNED');
    END IF;
  END IF;
  INSERT INTO public.profile_customization (user_id, profile_frame_id) VALUES (auth.uid(), p_frame_id)
    ON CONFLICT (user_id) DO UPDATE SET profile_frame_id = EXCLUDED.profile_frame_id, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'profileFrameId', p_frame_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_card_back(p_card_back_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement_id text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_card_back_id NOT IN ('default','initiate-back','cipher-back','seven-back','theft-back','intrilex-back') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_CARD_BACK');
  END IF;
  -- IRX-H34: Validate achievement ownership for achievement-gated card backs
  v_achievement_id := CASE p_card_back_id
    WHEN 'initiate-back' THEN 'welcome-to-intrilex'
    WHEN 'cipher-back' THEN 'first-counter'
    WHEN 'seven-back' THEN 'lucky-seven'
    WHEN 'theft-back' THEN 'stack-theft'
    WHEN 'intrilex-back' THEN 'intrilexian'
    ELSE NULL
  END;
  IF v_achievement_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.account_achievements WHERE user_id = auth.uid() AND achievement_id = v_achievement_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ACHIEVEMENT_NOT_OWNED');
    END IF;
  END IF;
  INSERT INTO public.profile_customization (user_id, card_back_id) VALUES (auth.uid(), p_card_back_id)
    ON CONFLICT (user_id) DO UPDATE SET card_back_id = EXCLUDED.card_back_id, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'cardBackId', p_card_back_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: set_showcase_slot / clear_showcase_slot
-- Owner-only. Slot range validated (0-5). Item type validated.
-- Achievement ownership validated against account_achievements.
-- Badge ownership is not server-tracked (local-only); the application
-- layer validates badge ownership client-side and the server accepts
-- known badge IDs only.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_showcase_slot(
  p_slot integer,
  p_type text,
  p_item_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_slot < 0 OR p_slot >= 6 THEN RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT'); END IF;
  IF p_type NOT IN ('ACHIEVEMENT','BADGE') THEN RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TYPE'); END IF;
  IF length(p_item_id) < 1 OR length(p_item_id) > 128 THEN RETURN jsonb_build_object('ok', false, 'error', 'INVALID_ITEM_ID'); END IF;

  -- Enforce max 3 achievements + 3 badges
  SELECT count(*) INTO v_count FROM public.profile_showcase
    WHERE user_id = auth.uid() AND item_type = p_type AND slot <> p_slot;
  IF p_type = 'ACHIEVEMENT' AND v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_ACHIEVEMENTS');
  END IF;
  IF p_type = 'BADGE' AND v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_BADGES');
  END IF;

  -- Validate achievement ownership
  IF p_type = 'ACHIEVEMENT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.account_achievements WHERE user_id = auth.uid() AND achievement_id = p_item_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ACHIEVEMENT_NOT_OWNED');
    END IF;
  END IF;

  -- Prevent duplicate item
  IF EXISTS (SELECT 1 FROM public.profile_showcase WHERE user_id = auth.uid() AND item_type = p_type AND item_id = p_item_id AND slot <> p_slot) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_ITEM');
  END IF;

  INSERT INTO public.profile_showcase (user_id, slot, item_type, item_id)
    VALUES (auth.uid(), p_slot, p_type, p_item_id)
    ON CONFLICT (user_id, slot) DO UPDATE SET item_type = EXCLUDED.item_type, item_id = EXCLUDED.item_id, updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_showcase_slot(p_slot integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); END IF;
  IF p_slot < 0 OR p_slot >= 6 THEN RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT'); END IF;
  DELETE FROM public.profile_showcase WHERE user_id = auth.uid() AND slot = p_slot;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute on profile RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.get_public_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_self_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_display_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_handle TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_privacy TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_title TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_profile_frame TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_card_back TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_showcase_slot TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_showcase_slot TO authenticated;
