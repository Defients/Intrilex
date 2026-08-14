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

  FOR v_i := 0 TO v_p_count - 1 LOOP
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
