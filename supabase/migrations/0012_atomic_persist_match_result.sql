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
