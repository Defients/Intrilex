-- ═══════════════════════════════════════════════════════════════
-- Migration 0005: account_achievements + achievement_progress
--
-- Server-authoritative achievement unlocks for online matches.
-- Clients can read their own achievements; no client INSERT/UPDATE.
-- Local-only achievements may sync with LOCAL_DEVICE provenance.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_achievements (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id   text NOT NULL,
  unlocked_at      timestamptz NOT NULL DEFAULT now(),
  provenance       text NOT NULL DEFAULT 'SERVER'
    CHECK (provenance IN ('SERVER', 'LOCAL_DEVICE', 'LOCAL_AI', 'UNVERIFIED')),
  rules_version    text,
  product_version  text,
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.account_achievements ENABLE ROW LEVEL SECURITY;

-- Owner can read their own achievements
CREATE POLICY account_achievements_owner_select ON public.account_achievements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Owner can insert LOCAL_DEVICE/UNVERIFIED achievements (with provenance constraint)
CREATE POLICY account_achievements_owner_insert_local ON public.account_achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND provenance IN ('LOCAL_DEVICE', 'LOCAL_AI', 'UNVERIFIED')
  );

-- NO UPDATE/DELETE for authenticated role.
-- SERVER-provenance achievements can only be inserted by the service role.

-- ── achievement_progress ──
CREATE TABLE IF NOT EXISTS public.achievement_progress (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id   text NOT NULL,
  current_value    integer NOT NULL DEFAULT 0,
  target_value     integer NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.achievement_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY achievement_progress_owner_select ON public.achievement_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY achievement_progress_owner_update ON public.achievement_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY achievement_progress_owner_insert ON public.achievement_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
