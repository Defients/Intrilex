-- ═══════════════════════════════════════════════════════════════
-- 0018_achievement_catalog_constraint.sql
--
-- IRX-H42: Arbitrary achievement IDs/provenance enter account truth
--
-- The account_achievements and achievement_progress tables accepted any
-- arbitrary string as achievement_id.  A malicious client could insert
-- fake achievements with made-up IDs, polluting account truth.
--
-- This migration:
--   1. Creates a public.achievement_catalog table seeded with the 56
--      authoritative achievement IDs from packages/achievements.
--   2. Cleans up any existing rows with invalid achievement_ids.
--   3. Adds FK constraints from account_achievements and achievement_progress
--      to the catalog, enforcing that only known achievement IDs are accepted.
--   4. Enables RLS on the catalog (read-only to authenticated, no client writes).
--
-- The catalog is the single source of truth for valid achievement IDs at the
-- database level.  When new achievements are added to the codebase, a new
-- migration must INSERT them here.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Create the achievement catalog table ──

CREATE TABLE IF NOT EXISTS public.achievement_catalog (
  achievement_id  text PRIMARY KEY,
  added_in_migration  text NOT NULL DEFAULT '0018'
);

ALTER TABLE public.achievement_catalog ENABLE ROW LEVEL SECURITY;

-- Read-only to authenticated (clients can browse the valid catalog)
CREATE POLICY achievement_catalog_select ON public.achievement_catalog
  FOR SELECT TO authenticated
  USING (true);

-- Also readable by anon (public catalog — no sensitive data)
GRANT SELECT ON public.achievement_catalog TO authenticated, anon;

-- No client INSERT/UPDATE/DELETE — only service_role can modify the catalog
REVOKE ALL ON public.achievement_catalog FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.achievement_catalog TO authenticated, anon;

-- ── 2. Seed the catalog with the 56 authoritative achievement IDs ──

INSERT INTO public.achievement_catalog (achievement_id) VALUES
  ('welcome-to-intrilex'),
  ('first-blood'),
  ('twenty-one'),
  ('exactly-enough'),
  ('read-the-card'),
  ('other-side-of-the-card'),
  ('the-stack-exists'),
  ('not-so-fast'),
  ('miniature-warfare'),
  ('no-longer-new'),
  ('fair-trade'),
  ('upgrade'),
  ('gone-forever'),
  ('drop-anchor'),
  ('hold-fast'),
  ('supercharged'),
  ('two-become-one'),
  ('digging-deeper'),
  ('clean-sweep'),
  ('know-the-table'),
  ('stack-student'),
  ('denied'),
  ('double-denied'),
  ('nope-three'),
  ('the-stackening'),
  ('perfect-timing'),
  ('sequence-breaker'),
  ('clean-kill'),
  ('lucky-seven'),
  ('topdeck-sorcery'),
  ('found-money'),
  ('recursive-seven'),
  ('seven-heaven'),
  ('queens-court'),
  ('ace-in-the-hole'),
  ('super-authority'),
  ('stack-theft'),
  ('wild-card'),
  ('photo-finish'),
  ('from-behind'),
  ('overkill'),
  ('last-card-standing'),
  ('empty-handed-victory'),
  ('plan-b-was-plan-a'),
  ('turnabout'),
  ('no-shovel-required'),
  ('big-number-good'),
  ('reading-is-overpowered'),
  ('controlled-chaos'),
  ('window-shopper'),
  ('absolutely-excessive'),
  ('black-magic'),
  ('getting-dangerous'),
  ('intrilexian'),
  ('spades-scholar'),
  ('card-savant')
ON CONFLICT (achievement_id) DO NOTHING;

-- ── 3. Clean up any existing invalid achievement rows ──
-- Delete achievements that are not in the catalog before adding the FK.
-- This is safe because invalid IDs are by definition not real achievements.

DELETE FROM public.account_achievements
WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);

DELETE FROM public.achievement_progress
WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);

-- ── 4. Add FK constraints ──

ALTER TABLE public.account_achievements
  ADD CONSTRAINT account_achievements_achievement_id_fk
  FOREIGN KEY (achievement_id)
  REFERENCES public.achievement_catalog(achievement_id)
  ON DELETE CASCADE;

ALTER TABLE public.achievement_progress
  ADD CONSTRAINT achievement_progress_achievement_id_fk
  FOREIGN KEY (achievement_id)
  REFERENCES public.achievement_catalog(achievement_id)
  ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- Verification query:
--   SELECT COUNT(*) FROM public.achievement_catalog;
--   Expected: 56
--
--   SELECT achievement_id FROM public.account_achievements
--   WHERE achievement_id NOT IN (SELECT achievement_id FROM public.achievement_catalog);
--   Expected: 0 rows
-- ═══════════════════════════════════════════════════════════════
