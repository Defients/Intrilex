-- ═══════════════════════════════════════════════════════════════
-- Migration 0006: account_moderation
--
-- Server-owned account status. No client access.
-- The match server enforces moderation status on auth/match entry.
-- Private moderation notes are never exposed to clients.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_moderation (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BANNED')),
  reason_code   text,
  notes         text,  -- private — never exposed to clients
  expires_at    timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_moderation ENABLE ROW LEVEL SECURITY;

-- Owner can see only their own status (not notes/reason_code)
CREATE POLICY account_moderation_owner_select ON public.account_moderation
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- NO INSERT/UPDATE/DELETE for authenticated role.
-- Only the service role (admin server) can manage moderation.

-- ── updated_at trigger ──
DROP TRIGGER IF EXISTS account_moderation_updated_at ON public.account_moderation;
CREATE TRIGGER account_moderation_updated_at
  BEFORE UPDATE ON public.account_moderation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
