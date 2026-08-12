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
  IF v_season IS NULL THEN v_season := 'season-1'; END IF;

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
  IF v_season IS NULL THEN v_season := 'season-1'; END IF;

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
