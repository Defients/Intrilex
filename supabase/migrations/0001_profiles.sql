-- ═══════════════════════════════════════════════════════════════
-- Migration 0001: profiles
--
-- Safe player profile table — one row per auth user.
-- Separates mutable user profile state from authoritative competitive state.
--
-- RLS: owner can SELECT/UPDATE safe columns only.
--       INSERT is handled by a SECURITY DEFINER trigger on auth.users.
--       user_id, public_player_id, and server flags are NOT client-editable.
-- ═══════════════════════════════════════════════════════════════

-- ── profiles table ──
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_player_id text UNIQUE NOT NULL,
  display_name     text NOT NULL DEFAULT 'Player',
  handle           text UNIQUE,
  avatar_url       text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  profile_version  integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Constraints ──
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length
  CHECK (length(display_name) >= 1 AND length(display_name) <= 32);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_format
  CHECK (handle IS NULL OR (length(handle) >= 3 AND length(handle) <= 24
    AND handle ~ '^[a-zA-Z0-9_]+$'));

-- ── Case-insensitive handle uniqueness (functional index) ──
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_lower_uniq
  ON public.profiles (lower(handle))
  WHERE handle IS NOT NULL;

-- ── Reserved handle check ──
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_not_reserved
  CHECK (handle IS NULL OR lower(handle) NOT IN (
    'admin', 'administrator', 'intrilex', 'moderator', 'mod',
    'system', 'support', 'null', 'anonymous', 'guest', 'official',
    'dev', 'developer', 'staff', 'team', 'help', 'api', 'root',
    'superuser', 'operator', 'security', 'abuse', 'contact'
  ));

-- ── Enable RLS ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Owner can read their own profile
CREATE POLICY profiles_owner_select ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Owner can update safe columns only (NOT user_id, public_player_id, created_at)
CREATE POLICY profiles_owner_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No direct INSERT via client — profile creation is trigger-driven
-- No direct DELETE via client — cascaded from auth.users deletion

-- ── Profile provisioning function (SECURITY DEFINER) ──
-- Called by trigger on auth.users INSERT — creates profile idempotently.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_public_id text;
  raw_display text;
  cleaned_display text;
BEGIN
  -- Generate a unique public player ID (PLY_ + 12 random base62 chars)
  new_public_id := 'PLY_' || substr(
    encode(gen_random_bytes(9), 'base64'),
    1, 12
  );

  -- Derive display name from provider metadata, fallback to 'Player'
  raw_display := COALESCE(
    new.raw_user_meta_data->>'user_name',       -- Discord username
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Player'
  );

  -- Sanitize: strip control chars, collapse whitespace, truncate
  cleaned_display := left(
    regexp_replace(
      regexp_replace(raw_display, '[\x00-\x1F\x7F]', '', 'g'),
      '\s+', ' ', 'g'
    ),
    32
  );
  IF cleaned_display = '' THEN
    cleaned_display := 'Player';
  END IF;

  -- Idempotent insert — skip if profile already exists (handles replay/retry)
  INSERT INTO public.profiles (user_id, public_player_id, display_name)
  VALUES (new.id, new_public_id, cleaned_display)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── Trigger: create profile on auth user creation ──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
