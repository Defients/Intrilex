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
