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
