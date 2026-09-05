-- ═══════════════════════════════════════════════════════════════
-- 0027_harden_all_security_definer_search_path.sql
--
-- Phase 5: Set search_path on ALL SECURITY DEFINER functions.
--
-- Many SECURITY DEFINER functions created in migrations 0001-0022
-- were created without an explicit search_path. This is a search-path
-- injection vulnerability. This migration sets search_path = public
-- on all remaining SECURITY DEFINER functions that don't already
-- have it set.
--
-- Functions already fixed by 20260830074714_harden_authority_and_persistence.sql
-- (with search_path = '') are NOT touched.
--
-- IRX-C03: PostgreSQL identifies functions by (name, argument_types).
-- All signatures below were verified against the actual CREATE FUNCTION
-- statements in migrations 0001-0022. The original version of this
-- migration had incorrect signatures for nearly every function, which
-- caused `supabase db reset` to fail.
-- ═══════════════════════════════════════════════════════════════

-- Profiles (0001)
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- Ranked leaderboard (0009 / 0019 — DROP+CREATE changed return type)
ALTER FUNCTION public.get_ranked_leaderboard(text, text, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.get_player_standing(text, text, uuid) SET search_path = public;
ALTER FUNCTION public.get_ranked_seasons(text) SET search_path = public;
ALTER FUNCTION public.get_player_season_history(text, uuid) SET search_path = public;

-- Profile customization (0010)
ALTER FUNCTION public.get_public_profile(text) SET search_path = public;
ALTER FUNCTION public.get_self_profile() SET search_path = public;
ALTER FUNCTION public.update_display_name(text) SET search_path = public;
ALTER FUNCTION public.change_handle(text) SET search_path = public;
ALTER FUNCTION public.update_profile_privacy(text, text, text, text) SET search_path = public;
ALTER FUNCTION public.equip_title(text) SET search_path = public;
ALTER FUNCTION public.equip_profile_frame(text) SET search_path = public;
ALTER FUNCTION public.equip_card_back(text) SET search_path = public;
ALTER FUNCTION public.set_showcase_slot(integer, text, text) SET search_path = public;
ALTER FUNCTION public.clear_showcase_slot(integer) SET search_path = public;

-- Tier helpers (0011)
ALTER FUNCTION public.tier_for_rating(integer) SET search_path = public;

-- Atomic persist (0012) — NOT touched: 20260830074714 already set search_path = ''

-- Player directory (0013 / 0022 — CREATE OR REPLACE changed body)
ALTER FUNCTION public.get_player_directory(text, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.get_player_directory_count(text, text) SET search_path = public;
ALTER FUNCTION public.set_directory_visible(boolean) SET search_path = public;

-- Recent opponents (0015 / 0019 — DROP+CREATE changed return type)
ALTER FUNCTION public.get_recent_opponents(integer, integer) SET search_path = public;

-- Player relationships (0016)
ALTER FUNCTION public.follow_player(text) SET search_path = public;
ALTER FUNCTION public.unfollow_player(text) SET search_path = public;
ALTER FUNCTION public.set_rival(text) SET search_path = public;
ALTER FUNCTION public.unset_rival(text) SET search_path = public;
ALTER FUNCTION public.block_player(text) SET search_path = public;
ALTER FUNCTION public.unblock_player(text) SET search_path = public;
ALTER FUNCTION public.get_relationships(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.get_relationship_status(text) SET search_path = public;
ALTER FUNCTION public.get_suggested_rivals(integer) SET search_path = public;

-- Player reports (0021 / 20260830074714) — NOT touched: 20260830074714 already set search_path = ''
