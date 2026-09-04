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
-- ═══════════════════════════════════════════════════════════════

-- Profiles (0001)
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- Ranked leaderboard (0009)
ALTER FUNCTION public.get_ranked_leaderboard(INTEGER, INTEGER, UUID, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.get_player_standing(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.get_ranked_seasons(UUID) SET search_path = public;
ALTER FUNCTION public.get_player_season_history(UUID, UUID) SET search_path = public;

-- Profile customization (0010)
ALTER FUNCTION public.get_public_profile(UUID) SET search_path = public;
ALTER FUNCTION public.get_self_profile(UUID) SET search_path = public;
ALTER FUNCTION public.update_display_name(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.change_handle(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.update_profile_privacy(UUID, BOOLEAN, BOOLEAN, BOOLEAN) SET search_path = public;
ALTER FUNCTION public.equip_title(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.equip_profile_frame(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.equip_card_back(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.set_showcase_slot(UUID, INTEGER, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.clear_showcase_slot(UUID, INTEGER) SET search_path = public;

-- Tier helpers (0011)
ALTER FUNCTION public.tier_for_rating(NUMERIC) SET search_path = public;

-- Atomic persist (0012)
ALTER FUNCTION public.persist_match_result(JSONB) SET search_path = public;

-- Player directory (0013)
ALTER FUNCTION public.get_player_directory(INTEGER, INTEGER, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.get_player_directory_count(TEXT) SET search_path = public;
ALTER FUNCTION public.set_directory_visible(UUID, BOOLEAN) SET search_path = public;

-- Recent opponents (0015)
ALTER FUNCTION public.get_recent_opponents(UUID, INTEGER) SET search_path = public;

-- Player relationships (0016)
ALTER FUNCTION public.follow_player(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.unfollow_player(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.set_rival(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.unset_rival(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.block_player(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.unblock_player(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.get_relationships(UUID, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.get_relationship_status(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.get_suggested_rivals(UUID, INTEGER) SET search_path = public;

-- Player reports (0021)
ALTER FUNCTION public.submit_player_report(UUID, JSONB) SET search_path = public;
