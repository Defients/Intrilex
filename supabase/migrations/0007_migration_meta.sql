-- ═══════════════════════════════════════════════════════════════
-- Migration 0007: account_migrations
--
-- Tracks guest→permanent and local→account data migrations.
-- Ensures idempotency — running a migration twice must not duplicate data.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_migrations (
  migration_id       text PRIMARY KEY,
  source_identity    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_identity    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  migration_version  integer NOT NULL DEFAULT 1,
  completed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_identity, target_identity, migration_version)
);

ALTER TABLE public.account_migrations ENABLE ROW LEVEL SECURITY;

-- Owner can read migrations involving their account
CREATE POLICY account_migrations_owner_select ON public.account_migrations
  FOR SELECT TO authenticated
  USING (source_identity = auth.uid() OR target_identity = auth.uid());

-- NO INSERT/UPDATE/DELETE for authenticated role.
-- Only the service role (server) can record migrations.
