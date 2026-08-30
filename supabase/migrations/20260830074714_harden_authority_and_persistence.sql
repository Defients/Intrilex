-- Authority and persistence hardening discovered by the 2026-08-30 audit.
-- This is intentionally forward-only: previously deployed migrations remain immutable.

-- Match truth must retain the queue/season classification made at admission.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS queue_id text NOT NULL DEFAULT 'casual';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS season_id text;

CREATE INDEX IF NOT EXISTS matches_queue_season_ended_idx
  ON public.matches (queue_id, season_id, ended_at DESC);

-- Serialize result application by match and participant. The old function's
-- check-then-insert gate is safe only after these transaction-scoped locks.
ALTER FUNCTION public.persist_match_result(jsonb) RENAME TO persist_match_result_unlocked;
ALTER FUNCTION public.persist_match_result_unlocked(jsonb) SET search_path = '';

REVOKE ALL ON FUNCTION public.persist_match_result_unlocked(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.persist_match_result(p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_record jsonb := p_record;
  v_account_id text;
  v_queue_id text := COALESCE(p_record->>'queueId', 'casual');
  v_season_id text := NULLIF(p_record->>'seasonId', '');
BEGIN
  IF NULLIF(p_record->>'matchId', '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'alreadyPersisted', false, 'error', 'MATCH_ID_REQUIRED');
  END IF;
  IF v_queue_id NOT IN ('casual', 'ranked') THEN
    RETURN jsonb_build_object('success', false, 'alreadyPersisted', false, 'error', 'UNKNOWN_QUEUE');
  END IF;

  -- Resolve the season before entering the legacy transactional body. This
  -- prevents that body's historical `season-1` fallback from ever writing a
  -- fabricated ranked rating when admission supplied no durable season.
  IF v_queue_id = 'ranked' AND v_season_id IS NULL THEN
    SELECT rs.season_id INTO v_season_id
    FROM public.ranked_seasons rs
    WHERE rs.queue_id = 'ranked' AND rs.status = 'ACTIVE'
    ORDER BY rs.starts_at ASC
    LIMIT 1;
    IF v_season_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'alreadyPersisted', false, 'error', 'RANKED_SEASON_REQUIRED');
    END IF;
  END IF;

  v_record := pg_catalog.jsonb_set(v_record, '{queueId}', pg_catalog.to_jsonb(v_queue_id), true);
  IF v_season_id IS NOT NULL THEN
    v_record := pg_catalog.jsonb_set(v_record, '{seasonId}', pg_catalog.to_jsonb(v_season_id), true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match:' || (p_record->>'matchId'), 0)
  );

  FOR v_account_id IN
    SELECT DISTINCT participant->>'accountId'
    FROM jsonb_array_elements(COALESCE(p_record->'participants', '[]'::jsonb)) participant
    WHERE NULLIF(participant->>'accountId', '') IS NOT NULL
    ORDER BY participant->>'accountId'
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rating:' || v_account_id, 0)
    );
  END LOOP;

  v_result := public.persist_match_result_unlocked(v_record);

  IF COALESCE((v_result->>'success')::boolean, false)
     AND NOT COALESCE((v_result->>'alreadyPersisted')::boolean, false) THEN
    UPDATE public.matches
    SET queue_id = v_queue_id,
        season_id = v_season_id
    WHERE match_id = p_record->>'matchId';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_match_result(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role;

-- The original authenticated RPC remains available to a signed-in client,
-- but now has an empty search path and only qualified references.
CREATE OR REPLACE FUNCTION public.submit_player_report(
  p_reported_id uuid,
  p_reason_code text,
  p_description text DEFAULT NULL,
  p_match_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reporter_id uuid := (SELECT auth.uid());
  v_report_id uuid;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_reporter_id = p_reported_id THEN
    RAISE EXCEPTION 'Cannot report yourself' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code NOT IN ('HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid reason code' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Description exceeds 2000 characters' USING ERRCODE = '22001';
  END IF;

  INSERT INTO public.player_reports
    (reporter_id, reported_id, reason_code, description, match_ref)
  VALUES
    (v_reporter_id, p_reported_id, p_reason_code, NULLIF(trim(p_description), ''), NULLIF(trim(p_match_ref), ''))
  RETURNING report_id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_player_report(uuid, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid, text, text, text)
  TO authenticated;

-- Match-server report gateway. Reporter identity is supplied only from the
-- authenticated connection account, and the function is service-role-only.
CREATE OR REPLACE FUNCTION public.submit_player_report_server(
  p_reporter_id uuid,
  p_reported_id uuid,
  p_reason_code text,
  p_description text DEFAULT NULL,
  p_match_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  IF p_reporter_id IS NULL OR p_reported_id IS NULL OR p_reporter_id = p_reported_id THEN
    RAISE EXCEPTION 'Invalid reporter or target' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code NOT IN ('HARASSMENT', 'CHEATING', 'INAPPROPRIATE_NAME',
      'SPAM', 'DISCONNECT_ABUSE', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid reason code' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Description exceeds 2000 characters' USING ERRCODE = '22001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_reporter_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_reported_id) THEN
    RAISE EXCEPTION 'Unknown reporter or target' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'report:' || p_reporter_id::text || ':' || p_reported_id::text || ':' || p_reason_code || ':' || COALESCE(p_match_ref, ''),
      0
    )
  );

  SELECT pr.report_id INTO v_report_id
  FROM public.player_reports pr
  WHERE pr.reporter_id = p_reporter_id
    AND pr.reported_id = p_reported_id
    AND pr.reason_code = p_reason_code
    AND pr.match_ref IS NOT DISTINCT FROM NULLIF(trim(p_match_ref), '')
    AND pr.created_at >= pg_catalog.now() - interval '1 minute'
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF v_report_id IS NOT NULL THEN
    RETURN v_report_id;
  END IF;

  INSERT INTO public.player_reports
    (reporter_id, reported_id, reason_code, description, match_ref)
  VALUES
    (p_reporter_id, p_reported_id, p_reason_code, NULLIF(trim(p_description), ''), NULLIF(trim(p_match_ref), ''))
  RETURNING report_id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_player_report_server(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_player_report_server(uuid, uuid, text, text, text)
  TO service_role;

-- Tournament persistence is all-or-nothing and callable only by the server.
CREATE OR REPLACE FUNCTION public.upsert_tournament_atomic(
  p_tournament jsonb,
  p_participants jsonb DEFAULT '[]'::jsonb,
  p_matches jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tournament_id text := NULLIF(p_tournament->>'tournament_id', '');
  v_participant jsonb;
  v_match jsonb;
BEGIN
  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tournament:' || v_tournament_id, 0)
  );

  INSERT INTO public.tournaments (
    tournament_id, name, format, best_of, max_players,
    status, swiss_rounds, started_at, completed_at
  ) VALUES (
    v_tournament_id,
    p_tournament->>'name',
    p_tournament->>'format',
    (p_tournament->>'best_of')::integer,
    (p_tournament->>'max_players')::integer,
    p_tournament->>'status',
    COALESCE((p_tournament->>'swiss_rounds')::integer, 0),
    NULLIF(p_tournament->>'started_at', '')::timestamptz,
    NULLIF(p_tournament->>'completed_at', '')::timestamptz
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

  FOR v_participant IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
  LOOP
    IF NULLIF(v_participant->>'user_id', '') IS NOT NULL THEN
      INSERT INTO public.tournament_participants (
        tournament_id, user_id, public_player_id, display_name, handle, seed
      ) VALUES (
        v_tournament_id,
        (v_participant->>'user_id')::uuid,
        v_participant->>'public_player_id',
        v_participant->>'display_name',
        v_participant->>'handle',
        COALESCE((v_participant->>'seed')::integer, 1)
      )
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET
        public_player_id = EXCLUDED.public_player_id,
        display_name = EXCLUDED.display_name,
        handle = EXCLUDED.handle,
        seed = EXCLUDED.seed;
    END IF;
  END LOOP;

  FOR v_match IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_matches, '[]'::jsonb))
  LOOP
    INSERT INTO public.tournament_matches (
      match_id, tournament_id, round, player_a_id, player_b_id,
      status, winner_id, score_a, score_b, match_ref
    ) VALUES (
      v_match->>'match_id',
      v_tournament_id,
      (v_match->>'round')::integer,
      v_match->>'player_a_id',
      v_match->>'player_b_id',
      v_match->>'status',
      NULLIF(v_match->>'winner_id', ''),
      COALESCE((v_match->>'score_a')::integer, 0),
      COALESCE((v_match->>'score_b')::integer, 0),
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
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_tournament_atomic(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tournament_atomic(jsonb, jsonb, jsonb)
  TO service_role;

-- Raw auth UUIDs are server-private. Tournament discovery is already served
-- by the match server as public-player DTOs.
REVOKE SELECT ON public.tournament_participants FROM anon, authenticated;
DROP POLICY IF EXISTS tournament_participants_select ON public.tournament_participants;
