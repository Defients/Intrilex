-- ═══════════════════════════════════════════════════════════════
-- Migration 0002: account_settings
--
-- Private account settings — owner-readable, owner-editable.
-- No auth secrets stored here.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_settings (
  user_id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_visibility       text NOT NULL DEFAULT 'private'
    CHECK (profile_visibility IN ('private', 'friends', 'public')),
  match_history_visibility text NOT NULL DEFAULT 'private'
    CHECK (match_history_visibility IN ('private', 'public')),
  allow_spectators         boolean NOT NULL DEFAULT true,
  preferred_region         text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ── Enable RLS ──
ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_settings_owner_select ON public.account_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY account_settings_owner_update ON public.account_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY account_settings_owner_insert ON public.account_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── updated_at trigger ──
DROP TRIGGER IF EXISTS account_settings_updated_at ON public.account_settings;
CREATE TRIGGER account_settings_updated_at
  BEFORE UPDATE ON public.account_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
